from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound
from app.domain.schemas import SchoolCreate, SchoolUpdate
from app.infrastructure.db.models import School


class SchoolService:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def create(self, data: SchoolCreate) -> School:
        exists = (
            await self.s.execute(select(School).where(School.code == data.code))
        ).scalar_one_or_none()
        if exists:
            raise Conflict(f"school code '{data.code}' already exists")
        school = School(**data.model_dump())
        self.s.add(school)
        await self.s.commit()
        await self.s.refresh(school)
        return school

    async def get(self, school_id: UUID) -> School:
        school = await self.s.get(School, school_id)
        if school is None or school.deleted_at is not None:
            raise NotFound("school")
        return school

    async def update(self, school_id: UUID, data: SchoolUpdate) -> School:
        school = await self.get(school_id)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(school, k, v)
        await self.s.commit()
        await self.s.refresh(school)
        return school

    async def soft_delete(self, school_id: UUID) -> None:
        school = await self.get(school_id)
        school.deleted_at = datetime.now(tz=timezone.utc)
        await self.s.commit()

    async def list_(self, q: str | None, page: int, page_size: int) -> tuple[list[School], int]:
        base = select(School).where(School.deleted_at.is_(None))
        if q:
            base = base.where(School.name.ilike(f"%{q}%"))
        total = (await self.s.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (
            await self.s.execute(
                base.order_by(School.created_at.desc())
                .limit(page_size)
                .offset((page - 1) * page_size)
            )
        ).scalars().all()
        return rows, total
