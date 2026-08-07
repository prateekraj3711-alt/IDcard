from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school
from app.core.config import settings
from app.core.errors import NotFound
from app.domain.schemas import IdCardJobCreate
from app.infrastructure.db.models import (
    IdCardJob,
    IdCardJobStatus,
    IdCardTemplate,
    Student,
)
from app.infrastructure.storage.s3 import presign_get


class IdCardJobService:
    """
    Enqueues bulk ID card generation. In production the actual render runs in
    a Celery worker (Playwright → PDF/PNG, ReportLab for A4 sheets, JSZip for
    the download bundle). The API returns immediately with a job id; the
    dashboard polls status → download_url.
    """

    def __init__(self, session: AsyncSession):
        self.s = session

    async def create(self, req: IdCardJobCreate, user: CurrentUser) -> IdCardJob:
        ensure_same_school(user, req.school_id)
        template = await self.s.get(IdCardTemplate, req.template_id)
        if template is None or not template.is_active:
            raise NotFound("template")

        ids = await self._resolve_ids(req, user)
        job = IdCardJob(
            school_id=req.school_id,
            requested_by=user.id,
            template_id=req.template_id,
            student_ids=[str(i) for i in ids],
            class_id=req.class_id,
            section_id=req.section_id,
            output_format=req.output_format,
            layout=req.layout,
            total=len(ids),
            status=IdCardJobStatus.queued,
        )
        self.s.add(job)
        await self.s.commit()
        await self.s.refresh(job)
        # Real system: dispatch to Celery here — celery_app.send_task("render_id_cards", args=[job.id])
        return job

    async def get(self, job_id: UUID, user: CurrentUser) -> tuple[IdCardJob, str | None]:
        job = await self.s.get(IdCardJob, job_id)
        if job is None:
            raise NotFound("job")
        ensure_same_school(user, job.school_id)
        url = None
        if job.status == IdCardJobStatus.done and job.output_key:
            url = presign_get(settings.s3_bucket_idcards, job.output_key, expires_in=int(timedelta(hours=1).total_seconds()))
        return job, url

    async def _resolve_ids(self, req: IdCardJobCreate, user: CurrentUser) -> list[UUID]:
        if req.student_ids:
            return req.student_ids
        conds = [Student.school_id == req.school_id, Student.deleted_at.is_(None)]
        if req.class_id:
            conds.append(Student.class_id == req.class_id)
        if req.section_id:
            conds.append(Student.section_id == req.section_id)
        rows = (await self.s.execute(select(Student.id).where(*conds))).scalars().all()
        return list(rows)
