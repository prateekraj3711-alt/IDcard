from __future__ import annotations

from dataclasses import dataclass
from typing import Callable
from uuid import UUID

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.infrastructure.db.models import User, UserRole
from app.infrastructure.db.session import get_session


@dataclass
class CurrentUser:
    id: UUID
    role: UserRole
    school_id: UUID | None
    email: str
    full_name: str


async def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized("missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token)
    except ValueError as exc:
        raise Unauthorized(str(exc)) from exc

    user_id = UUID(payload["sub"])
    user = await session.get(User, user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise Unauthorized("user not found or inactive")
    if payload.get("tv", 0) != user.token_version:
        raise Unauthorized("session revoked")

    request.state.user_id = str(user.id)
    return CurrentUser(
        id=user.id,
        role=user.role,
        school_id=user.school_id,
        email=user.email,
        full_name=user.full_name,
    )


def require_role(*allowed: UserRole) -> Callable[[CurrentUser], CurrentUser]:
    async def _dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed:
            raise Forbidden(f"requires role in {[r.value for r in allowed]}")
        return user

    return _dep


def ensure_same_school(user: CurrentUser, school_id: UUID) -> None:
    """Enforce tenant isolation for non-super-admins.

    A teacher whose own ``school_id`` is ``NULL`` (registered standalone,
    picking a school per student) can operate on any school — that is the
    whole point of standalone teachers. Teachers who *are* pinned to a
    school stay scoped to it."""
    if user.role == UserRole.super_admin:
        return
    if user.school_id is None:
        return
    if user.school_id != school_id:
        raise Forbidden("cross-school access denied")
