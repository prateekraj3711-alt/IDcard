from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_role
from app.domain.schemas import (
    PasswordResetOut,
    TeacherCreate,
    TeacherCreatedOut,
    TeacherOut,
)
from app.infrastructure.db.models import UserRole
from app.infrastructure.db.session import get_session
from app.services.teachers import TeacherService

router = APIRouter(prefix="/teachers", tags=["teachers"])

SUPER = require_role(UserRole.super_admin)


@router.post("", response_model=TeacherCreatedOut, status_code=201)
async def create_teacher(
    body: TeacherCreate,
    _: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    row, creds = await TeacherService(session).create(body)
    return TeacherCreatedOut(
        id=row.id,
        full_name=row.full_name,
        email=row.email,
        role=row.role,
        school=None,
        is_active=row.is_active,
        last_login_at=row.last_login_at,
        credentials=creds,
    )


@router.get("", response_model=list[TeacherOut])
async def list_teachers(
    school_id: UUID,
    _: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    rows = await TeacherService(session).list_by_school(school_id)
    return [
        TeacherOut(
            id=r.id, full_name=r.full_name, email=r.email, role=r.role,
            school=None, is_active=r.is_active, last_login_at=r.last_login_at,
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
