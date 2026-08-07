from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_role
from app.domain.schemas import Page, SchoolCreate, SchoolOut, SchoolUpdate
from app.infrastructure.db.models import UserRole
from app.infrastructure.db.session import get_session
from app.services.schools import SchoolService

router = APIRouter(prefix="/schools", tags=["schools"])


@router.get("", response_model=Page)
async def list_schools(
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    _: CurrentUser = Depends(require_role(UserRole.super_admin)),
    session: AsyncSession = Depends(get_session),
):
    rows, total = await SchoolService(session).list_(q, page, page_size)
    return Page(
        items=[SchoolOut.model_validate(r) for r in rows],
        page=page, page_size=page_size, total=total,
    )


@router.post("", response_model=SchoolOut, status_code=201)
async def create_school(
    body: SchoolCreate,
    _: CurrentUser = Depends(require_role(UserRole.super_admin)),
    session: AsyncSession = Depends(get_session),
):
    return await SchoolService(session).create(body)


@router.get("/{school_id}", response_model=SchoolOut)
async def get_school(
    school_id: UUID,
    _: CurrentUser = Depends(require_role(UserRole.super_admin)),
    session: AsyncSession = Depends(get_session),
):
    return await SchoolService(session).get(school_id)


@router.patch("/{school_id}", response_model=SchoolOut)
async def update_school(
    school_id: UUID,
    body: SchoolUpdate,
    _: CurrentUser = Depends(require_role(UserRole.super_admin)),
    session: AsyncSession = Depends(get_session),
):
    return await SchoolService(session).update(school_id, body)


@router.delete("/{school_id}", status_code=204)
async def delete_school(
    school_id: UUID,
    _: CurrentUser = Depends(require_role(UserRole.super_admin)),
    session: AsyncSession = Depends(get_session),
):
    await SchoolService(session).soft_delete(school_id)
    return None
