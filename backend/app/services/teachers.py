from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound
from app.core.security import hash_password
from app.domain.schemas import TeacherCreate
from app.infrastructure.db.models import User, UserRole


class TeacherService:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def create(self, data: TeacherCreate) -> User:
        existing = (
            await self.s.execute(
                select(User).where((User.email == data.email) | (User.username == data.username))
            )
        ).scalar_one_or_none()
        if existing:
            raise Conflict("email or username already in use")

        user = User(
            email=data.email,
            username=data.username,
            password_hash=hash_password(data.password),
            full_name=data.full_name,
            role=UserRole.teacher,
            school_id=data.school_id,
            phone=data.phone,
        )
        self.s.add(user)
        await self.s.commit()
        await self.s.refresh(user)
        return user

    async def list_by_school(self, school_id: UUID) -> list[User]:
        rows = (
            await self.s.execute(
                select(User).where(
                    User.role == UserRole.teacher,
                    User.school_id == school_id,
                    User.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        return list(rows)

    async def soft_delete(self, user_id: UUID) -> None:
        user = await self.s.get(User, user_id)
        if user is None or user.role != UserRole.teacher:
            raise NotFound("teacher")
        user.deleted_at = datetime.now(tz=timezone.utc)
        user.is_active = False
        user.token_version += 1
        await self.s.commit()

    async def reset_password(self, user_id: UUID, new_password: str) -> None:
        user = await self.s.get(User, user_id)
        if user is None:
            raise NotFound("user")
        user.password_hash = hash_password(new_password)
        user.token_version += 1
        await self.s.commit()
