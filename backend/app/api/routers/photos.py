from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.domain.schemas import PhotoComplete, PhotoOut, PhotoUploadRequest, PhotoUploadUrl
from app.infrastructure.db.session import get_session
from app.services.photos import PhotoService

router = APIRouter(prefix="/students/{student_id}/photo", tags=["photos"])


@router.post("/upload-url", response_model=PhotoUploadUrl)
async def upload_url(
    student_id: UUID,
    body: PhotoUploadRequest,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await PhotoService(session).issue_upload_url(student_id, body, user)


@router.post("/complete", response_model=PhotoOut, status_code=201)
async def complete(
    student_id: UUID,
    body: PhotoComplete,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await PhotoService(session).complete_upload(student_id, body, user)


@router.get("")
async def signed_url(
    student_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return {"url": await PhotoService(session).get_signed_url(student_id, user)}
