from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school
from app.core.config import settings
from app.core.errors import Conflict, NotFound
from app.domain.schemas import PhotoComplete, PhotoUploadRequest, PhotoUploadUrl
from app.infrastructure.db.models import AuditLog, Photo, Student
from app.infrastructure.storage import s3


class PhotoService:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def _load_student(self, student_id: UUID, user: CurrentUser) -> Student:
        student = await self.s.get(Student, student_id)
        if student is None or student.deleted_at is not None:
            raise NotFound("student")
        ensure_same_school(user, student.school_id)
        return student

    async def issue_upload_url(
        self, student_id: UUID, req: PhotoUploadRequest, user: CurrentUser
    ) -> PhotoUploadUrl:
        student = await self._load_student(student_id, user)
        if req.size_bytes > settings.max_photo_bytes:
            raise Conflict("photo exceeds max size")
        key = f"schools/{student.school_id}/students/{student.id}/{uuid4()}.jpg"
        signed = s3.presign_put(settings.s3_bucket_photos, key, req.content_type)
        return PhotoUploadUrl(**signed)

    async def complete_upload(
        self, student_id: UUID, req: PhotoComplete, user: CurrentUser
    ) -> Photo:
        student = await self._load_student(student_id, user)
        head = s3.head(settings.s3_bucket_photos, req.storage_key)
        if head is None:
            raise Conflict("object not found in storage")
        if head.get("ContentLength") != req.size_bytes:
            raise Conflict("size mismatch")

        await self.s.execute(
            update(Photo).where(Photo.student_id == student.id, Photo.is_primary.is_(True)).values(is_primary=False)
        )
        photo = Photo(
            student_id=student.id,
            storage_key=req.storage_key,
            content_type="image/jpeg",
            size_bytes=req.size_bytes,
            width=req.width,
            height=req.height,
            sha256=req.sha256,
            is_primary=True,
        )
        self.s.add(photo)
        self.s.add(AuditLog(
            user_id=user.id,
            action="photo.upload",
            entity_type="photo",
            entity_id=None,
            diff={"student_id": str(student.id), "storage_key": req.storage_key},
        ))
        await self.s.commit()
        await self.s.refresh(photo)
        return photo

    async def get_signed_url(self, student_id: UUID, user: CurrentUser) -> str:
        student = await self._load_student(student_id, user)
        photo = (
            await self.s.execute(
                select(Photo).where(Photo.student_id == student.id, Photo.is_primary.is_(True))
            )
        ).scalar_one_or_none()
        if photo is None:
            raise NotFound("photo")
        return s3.presign_get(settings.s3_bucket_photos, photo.storage_key)
