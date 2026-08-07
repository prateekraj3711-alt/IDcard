from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school
from app.core.config import settings
from app.core.errors import NotFound
from app.infrastructure.db.models import IdCardTemplate, Photo, School, Student
from app.infrastructure.storage import s3
from app.services.rendering import render_card_png


class IdCardService:
    """Preview rasterizer. Bulk rendering lives in IdCardJobService + workers.
    Uses the shared native-DPI renderer so preview and generated cards match."""

    def __init__(self, session: AsyncSession):
        self.s = session

    async def render_preview(self, student_id: UUID, template_id: UUID, user: CurrentUser) -> bytes:
        student = await self.s.get(Student, student_id)
        if student is None:
            raise NotFound("student")
        ensure_same_school(user, student.school_id)
        template = await self.s.get(IdCardTemplate, template_id)
        if template is None:
            raise NotFound("template")
        school = await self.s.get(School, student.school_id)

        # Fetch primary photo bytes if any.
        photo_bytes: bytes | None = None
        photo = (
            await self.s.execute(
                select(Photo).where(Photo.student_id == student.id, Photo.is_primary.is_(True))
            )
        ).scalar_one_or_none()
        if photo:
            try:
                obj = s3.get_s3_client().get_object(Bucket=settings.s3_bucket_photos, Key=photo.storage_key)
                photo_bytes = obj["Body"].read()
            except Exception:
                photo_bytes = None

        subject = {
            "student.name": student.name,
            "student.enrollment_no": student.enrollment_no,
            "student.roll_no": student.roll_no or "",
            "student.dob": student.dob.isoformat() if student.dob else "",
            "student.blood_group": student.blood_group or "",
            "student.father_name": student.father_name or "",
            "student.mother_name": student.mother_name or "",
            "student.address": student.address or "",
            "student.mobile": student.mobile or "",
            "school.name": school.name if school else "",
        }
        qr_payload = {
            "student_id": str(student.id),
            "enrollment_no": student.enrollment_no,
            "school_id": str(student.school_id),
        }

        return render_card_png(
            template.layout_json or {},
            subject,
            photo_bytes=photo_bytes,
            qr_payload=qr_payload,
        )
