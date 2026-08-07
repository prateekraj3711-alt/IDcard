from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school, require_role
from app.domain.schemas import TeacherCreate, TeacherOut
from app.infrastructure.db.models import UserRole
from app.infrastructure.db.session import get_session
from app.services.teachers import TeacherService

router = APIRouter(prefix="/teachers", tags=["teachers"])


@router.post("", response_model=TeacherOut, status_code=201)
async def create_teacher(
    body: TeacherCreate,
    user: CurrentUser = Depends(require_role(UserRole.super_admin, UserRole.school_admin)),
    session: AsyncSession = Depends(get_session),
):
    ensure_same_school(user, body.school_id)
    row = await TeacherService(session).create(body)
    return TeacherOut(
        id=row.id, full_name=row.full_name, email=row.email, role=row.role,
        school=None, is_active=row.is_active, last_login_at=row.last_login_at,
    )


@router.get("", response_model=list[TeacherOut])
async def list_teachers(
    school_id: UUID,
    user: CurrentUser = Depends(require_role(UserRole.super_admin, UserRole.school_admin)),
    session: AsyncSession = Depends(get_session),
):
    ensure_same_school(user, school_id)
    rows = await TeacherService(session).list_by_school(school_id)
    return [
        TeacherOut(
            id=r.id, full_name=r.full_name, email=r.email, role=r.role,
            school=None, is_active=r.is_active, last_login_at=r.last_login_at,
        )
        for r in rows
    ]


@router.delete("/{teacher_id}", status_code=204)
async def delete_teacher(
    teacher_id: UUID,
    _: CurrentUser = Depends(require_role(UserRole.super_admin, UserRole.school_admin)),
    session: AsyncSession = Depends(get_session),
):
    await TeacherService(session).soft_delete(teacher_id)
    return None
