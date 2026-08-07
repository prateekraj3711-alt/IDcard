from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.domain.schemas import SyncBatchIn, SyncBatchOut
from app.infrastructure.db.session import get_session
from app.services.sync import SyncService

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/batch", response_model=SyncBatchOut)
async def sync_batch(
    body: SyncBatchIn,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await SyncService(session).apply_batch(body, user)
