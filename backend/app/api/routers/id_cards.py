from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.infrastructure.db.session import get_session
from app.services.id_cards import IdCardService

router = APIRouter(prefix="/id-cards", tags=["id-cards"])


@router.get("/{student_id}/preview")
async def preview(
    student_id: UUID,
    template_id: UUID = Query(...),
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Fast rasterized preview for the dashboard. Bulk generation uses /id-card-jobs."""
    png = await IdCardService(session).render_preview(student_id, template_id, user)
    return Response(content=png, media_type="image/png")
