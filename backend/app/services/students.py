from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school
from app.core.errors import Conflict, Forbidden, NotFound
from app.domain.schemas import Page, StudentCreate, StudentOut, StudentUpdate
from app.infrastructure.db.models import (
    AuditLog,
    Photo,
    Student,
    StudentStatus,
    UserRole,
)
from app.infrastructure.storage.s3 import presign_get
from app.core.config import settings


class StudentService:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def upsert(self, data: StudentCreate, user: CurrentUser) -> Student:
        ensure_same_school(user, data.school_id)
        payload = data.model_dump(mode="json")
        payload["created_by"] = user.id

        stmt = (
            pg_insert(Student)
            .values(**payload)
            .on_conflict_do_update(
                index_elements=[Student.client_uuid],
                set_={
                    "class_id": payload.get("class_id"),
                    "section_id": payload.get("section_id"),
                    "enrollment_no": payload["enrollment_no"],
                    "roll_no": payload.get("roll_no"),
                    "name": payload["name"],
                    "father_name": payload.get("father_name"),
                    "mother_name": payload.get("mother_name"),
                    "dob": payload.get("dob"),
                    "blood_group": payload.get("blood_group"),
                    "gender": payload.get("gender"),
                    "address": payload.get("address"),
                    "mobile": payload.get("mobile"),
                    "enrolled_on": payload.get("enrolled_on"),
                    "status": payload["status"],
                    "updated_at": datetime.now(tz=timezone.utc),
                },
                where=(Student.school_id == data.school_id),
            )
            .returning(Student)
        )
        try:
            student = (await self.s.execute(stmt)).scalar_one()
        except Exception as exc:  # duplicate enrollment_no etc.
            await self.s.rollback()
            raise Conflict(f"duplicate: {exc.__class__.__name__}") from exc

        self.s.add(AuditLog(
            user_id=user.id,
            action="student.upsert",
            entity_type="student",
            entity_id=student.id,
            diff={"after": payload},
        ))
        await self.s.commit()
        await self.s.refresh(student)
        return student

    async def get(self, student_id: UUID, user: CurrentUser) -> Student:
        student = await self.s.get(Student, student_id)
        if student is None or student.deleted_at is not None:
            raise NotFound("student")
        ensure_same_school(user, student.school_id)
        return student

    async def patch(self, student_id: UUID, data: StudentUpdate, user: CurrentUser) -> Student:
        student = await self.get(student_id, user)
        if user.role == UserRole.teacher and student.status not in {
            StudentStatus.draft, StudentStatus.submitted
        }:
            raise Forbidden("teacher cannot edit non-draft students")

        before = {c.name: getattr(student, c.name) for c in Student.__table__.columns}
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(student, field, value)

        self.s.add(AuditLog(
            user_id=user.id,
            action="student.update",
            entity_type="student",
            entity_id=student.id,
            diff={"before": before, "after": data.model_dump(exclude_unset=True)},
        ))
        await self.s.commit()
        await self.s.refresh(student)
        return student

    async def soft_delete(self, student_id: UUID, user: CurrentUser) -> None:
        student = await self.get(student_id, user)
        student.deleted_at = datetime.now(tz=timezone.utc)
        self.s.add(AuditLog(
            user_id=user.id,
            action="student.delete",
            entity_type="student",
            entity_id=student.id,
        ))
        await self.s.commit()

    async def list_(
        self,
        user: CurrentUser,
        *,
        q: str | None,
        school_id: UUID | None,
        class_id: UUID | None,
        section_id: UUID | None,
        status: StudentStatus | None,
        page: int,
        page_size: int,
    ) -> Page:
        target_school = school_id or user.school_id
        if user.role != UserRole.super_admin:
            if target_school is None:
                raise Forbidden("no school scope")
            ensure_same_school(user, target_school)

        conds = [Student.deleted_at.is_(None)]
        if target_school:
            conds.append(Student.school_id == target_school)
        if class_id:
            conds.append(Student.class_id == class_id)
        if section_id:
            conds.append(Student.section_id == section_id)
        if status:
            conds.append(Student.status == status)
        if q:
            like = f"%{q}%"
            conds.append(
                or_(
                    Student.name.ilike(like),
                    Student.father_name.ilike(like),
                    Student.mother_name.ilike(like),
                    Student.enrollment_no.ilike(like),
                    Student.mobile.ilike(like),
                )
            )

        base = select(Student).where(and_(*conds))
        total = (
            await self.s.execute(select(func.count()).select_from(base.subquery()))
        ).scalar_one()

        items = (
            await self.s.execute(
                base.order_by(Student.created_at.desc())
                .limit(page_size)
                .offset((page - 1) * page_size)
            )
        ).scalars().all()

        primary_urls: dict[UUID, str] = {}
        if items:
            student_ids = [s.id for s in items]
            photos = (
                await self.s.execute(
                    select(Photo).where(Photo.student_id.in_(student_ids), Photo.is_primary.is_(True))
                )
            ).scalars().all()
            for p in photos:
                primary_urls[p.student_id] = presign_get(settings.s3_bucket_photos, p.storage_key)

        outs = [
            StudentOut.model_validate({**s.__dict__, "primary_photo_url": primary_urls.get(s.id)})
            for s in items
        ]
        return Page(items=outs, page=page, page_size=page_size, total=total)
