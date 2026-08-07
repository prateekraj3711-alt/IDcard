from __future__ import annotations

import json
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school
from app.core.config import settings
from app.core.errors import Conflict, NotFound, Validation
from app.domain.schemas import TemplateCreate, TemplateUpdate
from app.infrastructure.db.models import IdCardTemplate, TemplateModule
from app.infrastructure.storage.s3 import get_s3_client, presign_get


class TemplateService:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def create(self, data: TemplateCreate, user: CurrentUser) -> IdCardTemplate:
        if data.school_id:
            ensure_same_school(user, data.school_id)
        t = IdCardTemplate(**data.model_dump(), created_by=user.id)
        self.s.add(t)
        await self.s.commit()
        await self.s.refresh(t)
        _hydrate_signed_urls(t)
        return t

    async def update(self, template_id: UUID, data: TemplateUpdate, user: CurrentUser) -> IdCardTemplate:
        t = await self._load(template_id, user)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(t, k, v)
        t.version += 1
        await self.s.commit()
        await self.s.refresh(t)
        _hydrate_signed_urls(t)
        return t

    async def get(self, template_id: UUID, user: CurrentUser) -> IdCardTemplate:
        t = await self._load(template_id, user)
        _hydrate_signed_urls(t)
        return t

    async def list_(self, user: CurrentUser, school_id: UUID | None) -> list[IdCardTemplate]:
        stmt = select(IdCardTemplate).where(IdCardTemplate.is_active.is_(True))
        if school_id:
            ensure_same_school(user, school_id)
            stmt = stmt.where(
                (IdCardTemplate.school_id == school_id) | (IdCardTemplate.school_id.is_(None))
            )
        rows = (await self.s.execute(stmt.order_by(IdCardTemplate.created_at.desc()))).scalars().all()
        for r in rows:
            _hydrate_signed_urls(r)
        return list(rows)

    # ---- Import ----------------------------------------------------------

    async def import_from_bytes(
        self,
        user: CurrentUser,
        filename: str,
        content_type: str | None,
        body: bytes,
        *,
        module: TemplateModule,
        name: str,
        school_id: UUID | None,
    ) -> tuple[IdCardTemplate, str]:
        if school_id:
            ensure_same_school(user, school_id)

        ext = (filename.rsplit(".", 1)[-1] or "").lower()
        if ext == "json" or (content_type or "").startswith("application/json"):
            return await self._import_json(user, body, module, name, school_id), "json"
        if ext in {"png", "jpg", "jpeg"} or (content_type or "").startswith("image/"):
            return await self._import_image(user, filename, ext, body, module, name, school_id), "image"
        raise Conflict("only .json, .png, or .jpg templates can be imported")

    async def _import_json(
        self, user: CurrentUser, body: bytes,
        module: TemplateModule, name: str, school_id: UUID | None,
    ) -> IdCardTemplate:
        try:
            data: dict[str, Any] = json.loads(body)
        except Exception as exc:
            raise Validation(f"invalid JSON: {exc}") from exc

        layout = data.get("layout_json") or data  # accept either wrapper or raw layout
        if not isinstance(layout, dict) or "elements" not in layout:
            raise Validation("template JSON must include a `layout_json.elements` array")

        t = IdCardTemplate(
            school_id=school_id,
            module=TemplateModule(data.get("module", module.value)),
            name=data.get("name") or name,
            layout_json=layout,
            paper_size=data.get("paper_size", "A4"),
            card_width_mm=int(data.get("card_width_mm", 86)),
            card_height_mm=int(data.get("card_height_mm", 54)),
            html=data.get("html"),
            css=data.get("css", ""),
            created_by=user.id,
        )
        self.s.add(t)
        await self.s.commit()
        await self.s.refresh(t)
        _hydrate_signed_urls(t)
        return t

    async def _import_image(
        self, user: CurrentUser, filename: str, ext: str, body: bytes,
        module: TemplateModule, name: str, school_id: UUID | None,
    ) -> IdCardTemplate:
        template_id = uuid4()
        norm_ext = "jpg" if ext in {"jpg", "jpeg"} else "png"
        key = f"templates/{template_id}/background.{norm_ext}"
        get_s3_client().put_object(
            Bucket=settings.s3_bucket_idcards,
            Key=key,
            Body=body,
            ContentType=f"image/{'jpeg' if norm_ext == 'jpg' else 'png'}",
        )

        # Canvas defaults tuned to CR80 aspect; user can adjust after import.
        width, height = 340, 214
        layout: dict[str, Any] = {
            "width": width,
            "height": height,
            "background": "#ffffff",
            "background_image": {"storage_key": key, "locked": True},
            "elements": [],
        }

        t = IdCardTemplate(
            id=template_id,
            school_id=school_id,
            module=module,
            name=name,
            layout_json=layout,
            paper_size="A4",
            card_width_mm=86,
            card_height_mm=54,
            created_by=user.id,
        )
        self.s.add(t)
        await self.s.commit()
        await self.s.refresh(t)
        _hydrate_signed_urls(t)
        return t

    async def _load(self, template_id: UUID, user: CurrentUser) -> IdCardTemplate:
        t = await self.s.get(IdCardTemplate, template_id)
        if t is None:
            raise NotFound("template")
        if t.school_id:
            ensure_same_school(user, t.school_id)
        return t


def _hydrate_signed_urls(template: IdCardTemplate) -> None:
    """Attach fresh signed URLs to any storage_key references inside layout_json.
    Mutates in place; the mutation is not persisted (SQLAlchemy sees no change
    on scalar fields because `layout_json` is JSONB but we don't call flush).
    """
    layout = template.layout_json
    if not isinstance(layout, dict):
        return

    bg = layout.get("background_image")
    if isinstance(bg, dict) and bg.get("storage_key"):
        bg["url"] = presign_get(settings.s3_bucket_idcards, bg["storage_key"], expires_in=3600)

    for el in layout.get("elements", []) or []:
        if isinstance(el, dict) and el.get("storage_key"):
            el["url"] = presign_get(settings.s3_bucket_idcards, el["storage_key"], expires_in=3600)
