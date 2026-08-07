from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_role
from app.domain.schemas import (
    AdminCreate,
    AdminCreatedOut,
    AdminOut,
    PasswordResetOut,
)
from app.infrastructure.db.models import UserRole
from app.infrastructure.db.session import get_session
from app.services.admins import AdminService

router = APIRouter(prefix="/admins", tags=["admins"])
SUPER = require_role(UserRole.super_admin)


@router.get("", response_model=list[AdminOut])
async def list_admins(
    _: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    rows = await AdminService(session).list_()
    return [AdminOut.model_validate(r) for r in rows]


@router.post("", response_model=AdminCreatedOut, status_code=201)
async def create_admin(
    body: AdminCreate,
    _: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    row, creds = await AdminService(session).create(body)
    return AdminCreatedOut(
        id=row.id,
        full_name=row.full_name,
        email=row.email,
        phone=row.phone,
        role=row.role,
        is_active=row.is_active,
        last_login_at=row.last_login_at,
        created_at=row.created_at,
        credentials=creds,
    )


@router.post("/{admin_id}/regenerate-password", response_model=PasswordResetOut)
async def regenerate_password(
    admin_id: UUID,
    actor: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    creds = await AdminService(session).regenerate_password(admin_id, actor)
    return PasswordResetOut(user_id=admin_id, credentials=creds)


@router.delete("/{admin_id}", status_code=204)
async def delete_admin(
    admin_id: UUID,
    actor: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    await AdminService(session).soft_delete(admin_id, actor)
    return None
