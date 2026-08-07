from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_role
from app.domain.schemas import IdCardJobCreate, IdCardJobOut
from app.infrastructure.db.models import UserRole
from app.infrastructure.db.session import get_session
from app.services.id_card_jobs import IdCardJobService

router = APIRouter(prefix="/id-card-jobs", tags=["id-card-jobs"])
SUPER = require_role(UserRole.super_admin)


@router.post("", response_model=IdCardJobOut, status_code=202)
async def create_job(
    body: IdCardJobCreate,
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    job = await IdCardJobService(session).create(body, user)
    return IdCardJobOut(**{c.name: getattr(job, c.name) for c in job.__table__.columns}, download_url=None)


@router.get("/{job_id}", response_model=IdCardJobOut)
async def get_job(
    job_id: UUID,
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    job, url = await IdCardJobService(session).get(job_id, user)
    return IdCardJobOut(
        **{c.name: getattr(job, c.name) for c in job.__table__.columns},
        download_url=url,
    )
