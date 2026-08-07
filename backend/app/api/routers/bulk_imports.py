from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school, require_role
from app.core.errors import Conflict
from app.domain.schemas import (
    BulkImportCommitRequest,
    BulkImportCommitResult,
    BulkImportOut,
    BulkImportPreview,
    BulkImportRowOut,
)
from app.infrastructure.db.models import BulkImport, BulkImportRow, UserRole
from app.infrastructure.db.session import get_session
from app.services.bulk_imports import BulkImportService

router = APIRouter(prefix="/bulk-imports", tags=["bulk-imports"])

SUPER = require_role(UserRole.super_admin)

MAX_SPREADSHEET_BYTES = 20 * 1024 * 1024   # 20 MB
MAX_PHOTO_ZIP_BYTES = 500 * 1024 * 1024    # 500 MB


@router.post("", response_model=BulkImportPreview, status_code=201)
async def upload_spreadsheet(
    school_id: UUID = Form(...),
    file: UploadFile = File(...),
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    body = await file.read()
    if len(body) > MAX_SPREADSHEET_BYTES:
        raise Conflict("file too large")
    return await BulkImportService(session).upload(
        user=user,
        school_id=school_id,
        filename=file.filename or "upload",
        content=body,
    )


@router.post("/{import_id}/photos")
async def attach_photos(
    import_id: UUID,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    body = await file.read()
    if len(body) > MAX_PHOTO_ZIP_BYTES:
        raise Conflict("zip too large")
    return await BulkImportService(session).attach_photos(user, import_id, body)


@router.post("/{import_id}/commit", response_model=BulkImportCommitResult)
async def commit(
    import_id: UUID,
    body: BulkImportCommitRequest,
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    return await BulkImportService(session).commit(user, import_id, body)


@router.get("/{import_id}", response_model=BulkImportOut)
async def get_import(
    import_id: UUID,
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    imp = await session.get(BulkImport, import_id)
    if imp is None:
        from app.core.errors import NotFound
        raise NotFound("import")
    ensure_same_school(user, imp.school_id)
    return imp


@router.get("/{import_id}/rows", response_model=list[BulkImportRowOut])
async def list_rows(
    import_id: UUID,
    status_filter: str | None = None,
    limit: int = 200,
    offset: int = 0,
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    imp = await session.get(BulkImport, import_id)
    if imp is None:
        from app.core.errors import NotFound
        raise NotFound("import")
    ensure_same_school(user, imp.school_id)

    stmt = select(BulkImportRow).where(BulkImportRow.bulk_import_id == import_id)
    if status_filter:
        stmt = stmt.where(BulkImportRow.status == status_filter)
    rows = (
        await session.execute(
            stmt.order_by(BulkImportRow.row_index).limit(limit).offset(offset)
        )
    ).scalars().all()
    return [BulkImportRowOut.model_validate(r) for r in rows]
