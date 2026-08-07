from __future__ import annotations

import io
import json
from uuid import UUID

import qrcode
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school
from app.core.config import settings
from app.core.errors import NotFound
from app.infrastructure.db.models import IdCardTemplate, Photo, Student
from app.infrastructure.storage import s3


def _qr_png(payload: dict) -> bytes:
    img = qrcode.make(json.dumps(payload, separators=(",", ":")))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class IdCardService:
    """Preview rasterizer. Bulk rendering lives in IdCardJobService + workers."""

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

        photo_url = None
        photo = (
            await self.s.execute(
                select(Photo).where(Photo.student_id == student.id, Photo.is_primary.is_(True))
            )
        ).scalar_one_or_none()
        if photo:
            photo_url = s3.presign_get(settings.s3_bucket_photos, photo.storage_key)

        # Scaffolded preview: return the QR PNG. Real preview would use the same
        # rendering pipeline (Playwright) that the worker uses.
        return _qr_png({
            "student_id": str(student.id),
            "enrollment_no": student.enrollment_no,
            "school_id": str(student.school_id),
            "photo": photo_url,
        })
