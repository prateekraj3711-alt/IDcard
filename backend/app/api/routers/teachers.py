from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_role
from app.domain.schemas import (
    PasswordResetOut,
    SchoolMini,
    TeacherCreate,
    TeacherCreatedOut,
    TeacherOut,
)
from app.infrastructure.db.models import School, UserRole
from app.infrastructure.db.session import get_session
from app.services.teachers import TeacherService

router = APIRouter(prefix="/teachers", tags=["teachers"])

SUPER = require_role(UserRole.super_admin)


def _school_mini(school: School | None) -> SchoolMini | None:
    if school is None:
        return None
    return SchoolMini(id=school.id, code=school.code, name=school.name)


@router.post("", response_model=TeacherCreatedOut, status_code=201)
async def create_teacher(
    body: TeacherCreate,
    _: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    row, creds = await TeacherService(session).create(body)
    school = await session.get(School, row.school_id) if row.school_id else None
    return TeacherCreatedOut(
        id=row.id,
        full_name=row.full_name,
        email=row.email,
        role=row.role,
        school=_school_mini(school),
        is_active=row.is_active,
        last_login_at=row.last_login_at,
        credentials=creds,
    )


@router.get("", response_model=list[TeacherOut])
async def list_teachers(
    school_id: UUID | None = None,
    _: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    """List teachers. If ``school_id`` is omitted, returns teachers across every
    school — useful when the admin wants to locate a self-registered teacher
    without knowing which school code they signed up with."""
    rows = await TeacherService(session).list(school_id=school_id)
    school_ids = {r.school_id for r in rows if r.school_id}
    schools: dict[UUID, School] = {}
    if school_ids:
        from sqlalchemy import select
        result = await session.execute(select(School).where(School.id.in_(school_ids)))
        for s in result.scalars().all():
            schools[s.id] = s
    return [
        TeacherOut(
            id=r.id, full_name=r.full_name, email=r.email, role=r.role,
            school=_school_mini(schools.get(r.school_id)) if r.school_id else None,
            is_active=r.is_active, last_login_at=r.last_login_at,
        )
        for r in rows
    ]


@router.post("/{teacher_id}/regenerate-password", response_model=PasswordResetOut)
async def regenerate_password(
    teacher_id: UUID,
    _: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    creds = await TeacherService(session).regenerate_password(teacher_id)
    return PasswordResetOut(user_id=teacher_id, credentials=creds)


@router.delete("/{teacher_id}", status_code=204)
async def delete_teacher(
    teacher_id: UUID,
    _: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    await TeacherService(session).soft_delete(teacher_id)
    return None
