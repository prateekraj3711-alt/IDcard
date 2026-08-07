from __future__ import annotations

import io
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import qrcode
from jinja2 import Environment, select_autoescape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school
from app.core.errors import NotFound
from app.domain.schemas import IdCardGenerateRequest, IdCardJob
from app.infrastructure.db.models import IdCard, IdCardTemplate, Photo, Student
from app.core.config import settings
from app.infrastructure.storage import s3

_jinja = Environment(autoescape=select_autoescape(["html", "xml"]))


def _qr_png(payload: dict) -> bytes:
    img = qrcode.make(json.dumps(payload, separators=(",", ":")))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class IdCardService:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def _resolve_student_ids(self, req: IdCardGenerateRequest, user: CurrentUser) -> list[UUID]:
        if req.student_ids:
            return req.student_ids
        conds = [Student.deleted_at.is_(None)]
        if req.school_id:
            ensure_same_school(user, req.school_id)
            conds.append(Student.school_id == req.school_id)
        if req.class_id:
            conds.append(Student.class_id == req.class_id)
        if req.section_id:
            conds.append(Student.section_id == req.section_id)
        rows = (await self.s.execute(select(Student.id).where(*conds))).scalars().all()
        return list(rows)

    async def generate(self, req: IdCardGenerateRequest, user: CurrentUser) -> IdCardJob:
        template = await self.s.get(IdCardTemplate, req.template_id)
        if template is None or not template.is_active:
            raise NotFound("template")

        student_ids = await self._resolve_student_ids(req, user)

        # In production this would enqueue a Celery task and return a job id;
        # the worker renders HTML → PNG/PDF via Playwright, writes to S3.
        # For scaffolding we generate the QR + record only.
        for sid in student_ids:
            student = await self.s.get(Student, sid)
            if student is None:
                continue
            ensure_same_school(user, student.school_id)
            qr_payload = {
                "student_id": str(student.id),
                "enrollment_no": student.enrollment_no,
                "school_id": str(student.school_id),
            }
            self.s.add(
                IdCard(
                    student_id=student.id,
                    template_id=template.id,
                    qr_payload=qr_payload,
                    generated_by=user.id,
                )
            )
        await self.s.commit()

        job_id = f"job_{uuid4().hex[:24]}"
        return IdCardJob(
            job_id=job_id,
            status="queued",
            expires_at=datetime.now(tz=timezone.utc) + timedelta(hours=1),
        )

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

        # In production the worker uses Playwright to rasterize the HTML.
        # For the scaffold we return QR PNG bytes so the endpoint is exercisable.
        return _qr_png({
            "student_id": str(student.id),
            "enrollment_no": student.enrollment_no,
            "school_id": str(student.school_id),
            "photo": photo_url,
        })
