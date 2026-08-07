from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school
from app.core.errors import NotFound
from app.domain.schemas import TemplateCreate, TemplateUpdate
from app.infrastructure.db.models import IdCardTemplate


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
        return t

    async def update(self, template_id: UUID, data: TemplateUpdate, user: CurrentUser) -> IdCardTemplate:
        t = await self._load(template_id, user)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(t, k, v)
        t.version += 1
        await self.s.commit()
        await self.s.refresh(t)
        return t

    async def get(self, template_id: UUID, user: CurrentUser) -> IdCardTemplate:
        return await self._load(template_id, user)

    async def list_(self, user: CurrentUser, school_id: UUID | None) -> list[IdCardTemplate]:
        stmt = select(IdCardTemplate).where(IdCardTemplate.is_active.is_(True))
        if school_id:
            ensure_same_school(user, school_id)
            stmt = stmt.where(
                (IdCardTemplate.school_id == school_id) | (IdCardTemplate.school_id.is_(None))
            )
        rows = (await self.s.execute(stmt.order_by(IdCardTemplate.created_at.desc()))).scalars().all()
        return list(rows)

    async def _load(self, template_id: UUID, user: CurrentUser) -> IdCardTemplate:
        t = await self.s.get(IdCardTemplate, template_id)
        if t is None:
            raise NotFound("template")
        if t.school_id:
            ensure_same_school(user, t.school_id)
        return t
