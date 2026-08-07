import os
import tempfile
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school, require_role
from app.core.config import settings
from app.core.errors import Conflict, NotFound
from app.domain.schemas import (
    BulkImportCommitRequest,
    BulkImportCommitResult,
    BulkImportOut,
    BulkImportPreview,
    BulkImportRowOut,
)
from app.infrastructure.db.models import BulkImport, BulkImportRow, UserRole
from app.infrastructure.db.session import get_session
from app.infrastructure.storage.s3 import presign_put
from app.services.bulk_imports import BulkImportService

router = APIRouter(prefix="/bulk-imports", tags=["bulk-imports"])

SUPER = require_role(UserRole.super_admin)

MAX_SPREADSHEET_BYTES = 20 * 1024 * 1024   # 20 MB
MAX_PHOTO_ZIP_BYTES = 500 * 1024 * 1024    # 500 MB
_CHUNK = 1024 * 1024                       # 1 MB stream chunks


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
    """
    Stream the ZIP to a temp file on disk instead of reading it fully into
    memory — a 90 MB ZIP × 4 gunicorn workers was blowing out the 512 MB
    Render free-tier RAM cap. The service then reads one photo entry at a
    time from the on-disk zip, uploads it, and discards the bytes.
    """
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp_path = tmp.name
    try:
        total = 0
        while True:
            chunk = await file.read(_CHUNK)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_PHOTO_ZIP_BYTES:
                tmp.close()
                raise Conflict("zip too large")
            tmp.write(chunk)
        tmp.close()
        return await BulkImportService(session).attach_photos_from_path(user, import_id, tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


class LocalPhotoPresignItem(BaseModel):
    enrollment_no: str
    content_type: str = "image/jpeg"


class LocalPhotoPresignResult(BaseModel):
    enrollment_no: str
    put_url: str
    storage_key: str
    required_headers: dict[str, str]


class LocalPhotoRecordItem(BaseModel):
    enrollment_no: str
    storage_key: str


@router.post(
    "/{import_id}/photos/presign",
    response_model=list[LocalPhotoPresignResult],
)
async def presign_local_photos(
    import_id: UUID,
    body: list[LocalPhotoPresignItem],
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    """Return a batch of presigned PUT URLs so the desktop client can stream
    photo bytes straight from the operator's disk to R2 — bypassing the
    server entirely. The server never sees the image bytes."""
    imp = await session.get(BulkImport, import_id)
    if imp is None:
        raise NotFound("import")
    ensure_same_school(user, imp.school_id)

    prefix = f"schools/{imp.school_id}/imports/{imp.id}/photos/"
    out: list[LocalPhotoPresignResult] = []
    for item in body:
        stem = "".join(c for c in item.enrollment_no.lower() if c.isalnum())
        if not stem:
            continue
        key = f"{prefix}{stem}.jpg"
        signed = presign_put(settings.s3_bucket_photos, key, content_type=item.content_type)
        out.append(
            LocalPhotoPresignResult(
                enrollment_no=item.enrollment_no,
                put_url=signed["url"],
                storage_key=signed["storage_key"],
                required_headers=signed["required_headers"],
            )
        )
    return out


@router.post("/{import_id}/photos/record")
async def record_local_photos(
    import_id: UUID,
    body: list[LocalPhotoRecordItem],
    user: CurrentUser = Depends(SUPER),
    session: AsyncSession = Depends(get_session),
):
    """After the desktop app has PUT each file to R2, it calls this to attach
    each storage_key to the matching BulkImportRow by enrollment_no."""
    imp = await session.get(BulkImport, import_id)
    if imp is None:
        raise NotFound("import")
    ensure_same_school(user, imp.school_id)

    mapping = imp.column_mapping or {}
    enrollment_col: str | None = None
    for col, field in mapping.items():
        if field == "enrollment_no":
            enrollment_col = col
            break

    rows = (
        await session.execute(
            select(BulkImportRow).where(BulkImportRow.bulk_import_id == imp.id)
        )
    ).scalars().all()

    lookup = {item.enrollment_no.strip().upper(): item.storage_key for item in body}
    matched = 0
    for row in rows:
        raw = row.raw or {}
        candidate = ""
        if enrollment_col and enrollment_col in raw:
            candidate = str(raw[enrollment_col]).strip().upper()
        if not candidate:
            # Fall back to whichever column contains an ID-shaped token
            for v in raw.values():
                sv = str(v).strip().upper()
                if sv in lookup:
                    candidate = sv
                    break
        if candidate and candidate in lookup:
            row.photo_storage_key = lookup[candidate]
            matched += 1

    imp.stats = {**(imp.stats or {}), "photos_matched": matched}
    imp.photos_prefix = f"schools/{imp.school_id}/imports/{imp.id}/photos/"
    await session.commit()
    return {"photos_matched": matched, "photos_uploaded": len(body)}


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
