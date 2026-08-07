from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_role
from app.domain.schemas import (
    TEMPLATE_FIELD_CATALOG,
    TemplateCreate,
    TemplateFieldCatalog,
    TemplateOut,
    TemplateUpdate,
)
from app.infrastructure.db.models import TemplateModule, UserRole
from app.infrastructure.db.session import get_session
from app.services.templates import TemplateService

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
