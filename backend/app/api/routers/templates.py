from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_role
from app.core.errors import Conflict
from app.domain.schemas import (
    TEMPLATE_FIELD_CATALOG,
    TemplateCreate,
    TemplateFieldCatalog,
    TemplateImportResult,
    TemplateOut,
    TemplateUpdate,
)
from app.infrastructure.db.models import TemplateModule, UserRole
from app.infrastructure.db.session import get_session
from app.services.templates import TemplateService

MAX_IMPORT_BYTES = 10 * 1024 * 1024   # 10 MB

router = APIRouter(prefix="/templates", tags=["templates"])
SUPER = require_role(UserRole.super_admin)


@router.get("", response_model=list[TemplateOut])
async def list_templates(
    module: TemplateModule | None = Query(default=None),
    school_id: UUID | None = None,
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    rows = await TemplateService(session).list_(user, school_id)
    if module:
        rows = [r for r in rows if r.module == module]
    return [TemplateOut.model_validate(r) for r in rows]


@router.post("", response_model=TemplateOut, status_code=201)
async def create_template(
    body: TemplateCreate,
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    return await TemplateService(session).create(body, user)


@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(
    template_id: UUID,
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    return await TemplateService(session).get(template_id, user)


@router.patch("/{template_id}", response_model=TemplateOut)
async def update_template(
    template_id: UUID,
    body: TemplateUpdate,
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    return await TemplateService(session).update(template_id, body, user)


@router.get("/fields/catalog", response_model=TemplateFieldCatalog)
async def field_catalog(
    module: TemplateModule = Query(default=TemplateModule.student),
    _: CurrentUser = Depends(SUPER),
):
    return TemplateFieldCatalog(module=module, fields=TEMPLATE_FIELD_CATALOG[module.value])


@router.post("/import", response_model=TemplateImportResult, status_code=201)
async def import_template(
    file: UploadFile = File(...),
    name: str = Form(default="Imported template"),
    module: TemplateModule = Form(default=TemplateModule.student),
    school_id: UUID | None = Form(default=None),
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    """
    Import a template from either a JSON export (round-trip) or a raster image
    (PNG/JPG). Images become a locked background layer on the canvas so the
    admin can drop editable field placeholders on top.
    """
    body = await file.read()
    if len(body) > MAX_IMPORT_BYTES:
        raise Conflict("file too large (max 10 MB)")
    template, source = await TemplateService(session).import_from_bytes(
        user=user,
        filename=file.filename or "template",
        content_type=file.content_type,
        body=body,
        module=module,
        name=name,
        school_id=school_id,
    )
    return TemplateImportResult(template=TemplateOut.model_validate(template), source=source)


@router.get("/{template_id}/export")
async def export_template(
    template_id: UUID,
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    """Return the template as a JSON export suitable for re-importing.
    Signed URLs are stripped; only storage keys remain."""
    t = await TemplateService(session).get(template_id, user)
    layout = _strip_signed_urls(t.layout_json or {})
    return {
        "name": t.name,
        "module": t.module.value,
        "paper_size": t.paper_size,
        "card_width_mm": t.card_width_mm,
        "card_height_mm": t.card_height_mm,
        "html": t.html,
        "css": t.css,
        "layout_json": layout,
    }


def _strip_signed_urls(layout: dict) -> dict:
    out = {k: v for k, v in layout.items() if k != "background_image"}
    bg = layout.get("background_image")
    if isinstance(bg, dict) and bg.get("storage_key"):
        out["background_image"] = {"storage_key": bg["storage_key"], "locked": bg.get("locked", True)}
    elements = []
    for el in layout.get("elements", []) or []:
        clean = {k: v for k, v in el.items() if k != "url"}
        elements.append(clean)
    out["elements"] = elements
    return out
