from __future__ import annotations

import re
import secrets
import string
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.errors import Conflict, Forbidden, NotFound
from app.core.security import hash_password
from app.domain.schemas import AdminCreate, GeneratedCredentials
from app.infrastructure.db.models import User, UserRole


class AdminService:
    """Super-admin lifecycle. Any existing super admin can add another,
    rotate passwords, or soft-delete a peer — with safety rails."""

    def __init__(self, session: AsyncSession):
        self.s = session

    async def list_(self) -> list[User]:
        rows = (
            await self.s.execute(
                select(User).where(
                    User.role == UserRole.super_admin,
                    User.deleted_at.is_(None),
                ).order_by(User.created_at.asc())
            )
        ).scalars().all()
        return list(rows)

    async def create(self, data: AdminCreate) -> tuple[User, GeneratedCredentials]:
        existing = (
            await self.s.execute(select(User).where(User.email == data.email))
        ).scalar_one_or_none()
        if existing:
            raise Conflict("email already in use")

        password = data.password or self._generate_password()
        # For admins the username defaults to the email (used only for display
        # and per-admin uniqueness); email is the login identifier.
        username = data.username or await self._suggest_username(data.full_name)

        user = User(
            email=data.email,
            username=username,
            password_hash=hash_password(password),
            full_name=data.full_name,
            role=UserRole.super_admin,
            school_id=None,
            phone=data.phone,
            is_active=True,
        )
        self.s.add(user)
        await self.s.commit()
        await self.s.refresh(user)
        return user, GeneratedCredentials(username=email_or(user, username), password=password)

    async def regenerate_password(self, admin_id: UUID, actor: CurrentUser) -> GeneratedCredentials:
        user = await self._require_admin(admin_id)
        password = self._generate_password()
        user.password_hash = hash_password(password)
        user.token_version += 1
        user.failed_login_attempts = 0
        await self.s.commit()
        return GeneratedCredentials(username=user.email, password=password)

    async def soft_delete(self, admin_id: UUID, actor: CurrentUser) -> None:
        if actor.id == admin_id:
            raise Forbidden("cannot delete your own account")
        # Prevent removing the last active super admin.
        active_count = (
            await self.s.execute(
                select(User).where(
                    User.role == UserRole.super_admin,
                    User.deleted_at.is_(None),
                    User.is_active.is_(True),
                )
            )
        ).all()
        if len(active_count) <= 1:
            raise Forbidden("cannot delete the last super admin")

        user = await self._require_admin(admin_id)
        user.deleted_at = datetime.now(tz=timezone.utc)
        user.is_active = False
        user.token_version += 1
        await self.s.commit()

    async def _require_admin(self, admin_id: UUID) -> User:
        user = await self.s.get(User, admin_id)
        if user is None or user.role != UserRole.super_admin or user.deleted_at is not None:
            raise NotFound("super admin")
        return user

    async def _suggest_username(self, full_name: str) -> str:
        base = re.sub(r"[^a-zA-Z0-9]+", ".", full_name.strip().lower()).strip(".")
        base = base[:40] or "admin"
        for suffix in ("", *[str(n) for n in range(1, 1000)]):
            candidate = f"{base}{suffix}"
            clash = (
                await self.s.execute(select(User).where(User.username == candidate))
            ).scalar_one_or_none()
            if clash is None:
                return candidate
        return f"{base}.{secrets.token_hex(3)}"

    @staticmethod
    def _generate_password(length: int = 14) -> str:
        alphabet = (
            "".join(c for c in string.ascii_letters if c not in "IlO")
            + "".join(c for c in string.digits if c not in "01")
        )
        return "".join(secrets.choice(alphabet) for _ in range(length))


def email_or(user: User, fallback: str) -> str:
    return user.email or fallback
