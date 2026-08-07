from __future__ import annotations

import re
import secrets
import string
from datetime import datetime, timezone
from uuid import UUID

import phonenumbers
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound
from app.core.security import hash_password
from app.domain.schemas import GeneratedCredentials, TeacherCreate
from app.infrastructure.db.models import User, UserRole


def _normalize_phone(raw: str | None, default_region: str = "IN") -> str | None:
    if not raw:
        return None
    try:
        parsed = phonenumbers.parse(raw, default_region)
        if not phonenumbers.is_valid_number(parsed):
            return None
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except Exception:
        return None


class TeacherService:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def create(self, data: TeacherCreate) -> tuple[User, GeneratedCredentials]:
        # Normalize phone up front so lookups from the login flow compare
        # against a canonical E.164 value.
        phone = _normalize_phone(data.phone) if data.phone else None
        if data.phone and phone is None:
            raise Conflict("phone number is not valid")

        existing_email = (
            await self.s.execute(select(User).where(User.email == data.email))
        ).scalar_one_or_none()
        if existing_email:
            raise Conflict("email already in use")

        if phone:
            existing_phone = (
                await self.s.execute(select(User).where(User.phone == phone))
            ).scalar_one_or_none()
            if existing_phone:
                raise Conflict("phone already in use")

        username = data.username or await self._suggest_username(data.full_name)
        if data.username:
            clash = (
                await self.s.execute(select(User).where(User.username == data.username))
            ).scalar_one_or_none()
            if clash:
                raise Conflict("username already in use")

        password = data.password or self._generate_password()

        user = User(
            email=data.email,
            username=username,
            password_hash=hash_password(password),
            full_name=data.full_name,
            role=UserRole.teacher,
            school_id=data.school_id,
            phone=phone,
        )
        self.s.add(user)
        await self.s.commit()
        await self.s.refresh(user)
        return user, GeneratedCredentials(username=username, password=password)

    async def list_by_school(self, school_id: UUID) -> list[User]:
        return await self.list(school_id=school_id)

    async def list(self, school_id: UUID | None = None) -> list[User]:
        """Fetch teachers; optionally filter to one school."""
        stmt = select(User).where(
            User.role == UserRole.teacher,
            User.deleted_at.is_(None),
        )
        if school_id is not None:
            stmt = stmt.where(User.school_id == school_id)
        rows = (await self.s.execute(stmt.order_by(User.created_at.desc()))).scalars().all()
        return list(rows)

    async def soft_delete(self, user_id: UUID) -> None:
        user = await self.s.get(User, user_id)
        if user is None or user.role != UserRole.teacher:
            raise NotFound("teacher")
        user.deleted_at = datetime.now(tz=timezone.utc)
        user.is_active = False
        user.token_version += 1
        await self.s.commit()

    async def regenerate_password(self, user_id: UUID) -> GeneratedCredentials:
        user = await self.s.get(User, user_id)
        if user is None or user.role != UserRole.teacher:
            raise NotFound("teacher")
        password = self._generate_password()
        user.password_hash = hash_password(password)
        user.token_version += 1
        user.failed_login_attempts = 0
        await self.s.commit()
        return GeneratedCredentials(username=user.username or "", password=password)

    async def _suggest_username(self, full_name: str) -> str:
        base = re.sub(r"[^a-zA-Z0-9]+", ".", full_name.strip().lower()).strip(".")
        base = base[:40] or "teacher"
        for suffix in ("", *[str(n) for n in range(1, 1000)]):
            candidate = f"{base}{suffix}"
            clash = (
                await self.s.execute(select(User).where(User.username == candidate))
            ).scalar_one_or_none()
            if clash is None:
                return candidate
        return f"{base}.{secrets.token_hex(3)}"

    @staticmethod
    def _generate_password(length: int = 12) -> str:
        # Human-friendly: mixed case + digits, no ambiguous chars.
        alphabet = (
            "".join(c for c in string.ascii_letters if c not in "IlO")
            + "".join(c for c in string.digits if c not in "01")
        )
        return "".join(secrets.choice(alphabet) for _ in range(length))
