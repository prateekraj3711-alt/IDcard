from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_role
from app.domain.schemas import Page, SchoolCreate, SchoolMini, SchoolOut, SchoolUpdate
from app.infrastructure.db.models import School, UserRole
from app.infrastructure.db.session import get_session
from app.services.schools import SchoolService

router = APIRouter(prefix="/schools", tags=["schools"])


@router.get("/available", response_model=list[SchoolMini])
async def list_available_schools(
    _: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Any signed-in user (super admin or teacher) can enumerate the active
    schools. Returns only the identity trio — id, code, name — no PII. Used
    by the Android app so a standalone teacher can pick which school a
    student belongs to."""
    rows = (
        await session.execute(
            select(School)
            .where(School.deleted_at.is_(None), School.is_active.is_(True))
            .order_by(School.name.asc())
        )
    ).scalars().all()
    return [SchoolMini(id=s.id, code=s.code, name=s.name) for s in rows]


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
