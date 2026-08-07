from __future__ import annotations

import csv
import io
import re
import zipfile
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Any
from uuid import UUID, uuid4

from openpyxl import load_workbook
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school
from app.core.config import settings
from app.core.errors import Conflict, NotFound, Validation
from app.domain.schemas import (
    DEFAULT_COLUMN_MAPPING,
    BulkImportCommitRequest,
    BulkImportCommitResult,
    BulkImportPreview,
    BulkImportRowOut,
)
from app.infrastructure.db.models import (
    BulkImport,
    BulkImportRow,
    BulkImportRowStatus,
    BulkImportStatus,
    Photo,
    Student,
    StudentStatus,
)
from app.infrastructure.storage.s3 import get_s3_client

STUDENT_FIELDS = {
    "name", "father_name", "mother_name", "enrollment_no", "roll_no",
    "dob", "blood_group", "gender", "address", "mobile",
    "enrolled_on", "enrolled_year", "photo_hint",
    "class_name", "section_name",
}


class BulkImportService:
    """Parses uploaded spreadsheets, matches photos by filename stem, and commits students."""

    def __init__(self, session: AsyncSession):
        self.s = session

    # ----- upload + parse ---------------------------------------------------

    async def upload(
        self,
        user: CurrentUser,
        school_id: UUID,
        filename: str,
        content: bytes,
    ) -> BulkImportPreview:
        ensure_same_school(user, school_id)
        source_type = _detect_type(filename)
        rows_raw = _parse(content, source_type)
        if not rows_raw:
            raise Validation("no rows detected in spreadsheet")

        columns = list(rows_raw[0].keys())
        suggested = self._suggest_mapping(columns)

        key = f"schools/{school_id}/imports/{uuid4()}.{source_type}"
        get_s3_client().put_object(
            Bucket=settings.s3_bucket_photos,   # a reasonable default bucket in dev
            Key=key,
            Body=content,
            ContentType=_content_type(source_type),
        )

        imp = BulkImport(
            school_id=school_id,
            uploader_id=user.id,
            source_type=source_type,
            original_filename=filename,
            spreadsheet_key=key,
            column_mapping=suggested,
            status=BulkImportStatus.uploaded,
            stats={"total": len(rows_raw), "valid": 0, "invalid": 0, "imported": 0, "photos_matched": 0},
        )
        self.s.add(imp)
        await self.s.flush()

        for i, raw in enumerate(rows_raw):
            self.s.add(
                BulkImportRow(
                    bulk_import_id=imp.id,
                    row_index=i + 1,
                    raw=raw,
                )
            )
        await self.s.commit()
        await self.s.refresh(imp)

        sample_rows = (
            await self.s.execute(
                select(BulkImportRow)
                .where(BulkImportRow.bulk_import_id == imp.id)
                .order_by(BulkImportRow.row_index)
                .limit(10)
            )
        ).scalars().all()

        return BulkImportPreview(
            import_id=imp.id,
            columns_detected=columns,
            suggested_mapping=suggested,
            total_rows=len(rows_raw),
            sample=[BulkImportRowOut.model_validate(r) for r in sample_rows],
        )

    # ----- photo folder -----------------------------------------------------

    async def attach_photos(self, user: CurrentUser, import_id: UUID, zip_bytes: bytes) -> dict:
        imp = await self._load(import_id, user)
        prefix = f"schools/{imp.school_id}/imports/{imp.id}/photos/"

        matched, uploaded = 0, 0
        client = get_s3_client()

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            stems: dict[str, tuple[str, bytes]] = {}
            for info in zf.infolist():
                if info.is_dir():
                    continue
                name = PurePosixPath(info.filename).name
                if not name or not _is_image(name):
                    continue
                stem = _normalize_stem(PurePosixPath(name).stem)
                with zf.open(info) as f:
                    stems[stem] = (name, f.read())

            rows = (
                await self.s.execute(
                    select(BulkImportRow).where(BulkImportRow.bulk_import_id == imp.id)
                )
            ).scalars().all()

            mapping = imp.column_mapping or {}
            for row in rows:
                enrollment_key = _column_for_field(mapping, "enrollment_no")
                photo_hint_key = _column_for_field(mapping, "photo_hint")
                enrollment = str(row.raw.get(enrollment_key, "")) if enrollment_key else ""
                hint = str(row.raw.get(photo_hint_key, "")) if photo_hint_key else ""

                candidates = [
                    _normalize_stem(enrollment),
                    _normalize_stem(PurePosixPath(hint).stem) if hint else "",
                ]
                found = next((stems[c] for c in candidates if c and c in stems), None)
                if found is None:
                    continue

                filename, body = found
                key = f"{prefix}{_normalize_stem(enrollment or PurePosixPath(filename).stem)}.jpg"
                client.put_object(Bucket=settings.s3_bucket_photos, Key=key, Body=body, ContentType="image/jpeg")
                row.photo_storage_key = key
                matched += 1
                uploaded += 1

        imp.photos_prefix = prefix
        imp.stats = {**(imp.stats or {}), "photos_matched": matched}
        await self.s.commit()
        return {"photos_uploaded": uploaded, "photos_matched": matched}

    # ----- validate + commit ------------------------------------------------

    async def commit(
        self, user: CurrentUser, import_id: UUID, req: BulkImportCommitRequest
    ) -> BulkImportCommitResult:
        imp = await self._load(import_id, user)
        mapping = req.column_mapping or imp.column_mapping or DEFAULT_COLUMN_MAPPING
        imp.column_mapping = mapping
        imp.status = BulkImportStatus.importing
        await self.s.flush()

        rows = (
            await self.s.execute(
                select(BulkImportRow).where(BulkImportRow.bulk_import_id == imp.id)
            )
        ).scalars().all()

        imported, failed = 0, 0
        for row in rows:
            mapped, errors = self._map_row(row.raw, mapping)
            row.mapped = mapped
            if errors:
                row.status = BulkImportRowStatus.invalid
                row.errors = errors
                failed += 1
                continue

            try:
                student = Student(
                    client_uuid=uuid4(),
                    school_id=imp.school_id,
                    class_id=req.default_class_id,
                    section_id=req.default_section_id,
                    enrollment_no=mapped["enrollment_no"],
                    name=mapped["name"],
                    father_name=mapped.get("father_name"),
                    mother_name=mapped.get("mother_name"),
                    dob=mapped.get("dob"),
                    blood_group=mapped.get("blood_group"),
                    address=mapped.get("address"),
                    mobile=mapped.get("mobile"),
                    enrolled_on=mapped.get("enrolled_on"),
                    status=StudentStatus.active,
                    created_by=user.id,
                )
                self.s.add(student)
                await self.s.flush()

                if row.photo_storage_key:
                    self.s.add(
                        Photo(
                            student_id=student.id,
                            storage_key=row.photo_storage_key,
                            content_type="image/jpeg",
                            size_bytes=0,       # backfilled by post-commit head request in real impl
                            sha256="0" * 64,
                            is_primary=True,
                        )
                    )
                row.status = BulkImportRowStatus.imported
                row.student_id = student.id
                imported += 1
            except Exception as exc:
                row.status = BulkImportRowStatus.failed
                row.errors = [{"code": "db_error", "message": str(exc)}]
                failed += 1

        imp.status = BulkImportStatus.completed if failed == 0 else BulkImportStatus.failed
        imp.stats = {
            **(imp.stats or {}),
            "imported": imported,
            "invalid": failed,
        }
        await self.s.commit()
        return BulkImportCommitResult(
            imported=imported, failed=failed,
            photos_matched=(imp.stats or {}).get("photos_matched", 0),
        )

    # ----- helpers ----------------------------------------------------------

    async def _load(self, import_id: UUID, user: CurrentUser) -> BulkImport:
        imp = await self.s.get(BulkImport, import_id)
        if imp is None:
            raise NotFound("import")
        ensure_same_school(user, imp.school_id)
        return imp

    def _suggest_mapping(self, columns: list[str]) -> dict[str, str]:
        result: dict[str, str] = {}
        for col in columns:
            key = col.strip()
            if key in DEFAULT_COLUMN_MAPPING:
                result[key] = DEFAULT_COLUMN_MAPPING[key]
                continue
            norm = re.sub(r"[^a-z0-9]+", "", key.lower())
            for canonical, field in DEFAULT_COLUMN_MAPPING.items():
                if re.sub(r"[^a-z0-9]+", "", canonical.lower()) == norm:
                    result[key] = field
                    break
        return result

    def _map_row(self, raw: dict, mapping: dict[str, str]) -> tuple[dict[str, Any], list[dict]]:
        mapped: dict[str, Any] = {}
        for col, value in raw.items():
            field = mapping.get(col)
            if field is None or field not in STUDENT_FIELDS:
                continue
            mapped[field] = _clean(value)

        errors: list[dict] = []
        if not mapped.get("name"):
            errors.append({"field": "name", "code": "required"})
        if not mapped.get("enrollment_no"):
            errors.append({"field": "enrollment_no", "code": "required"})
        else:
            mapped["enrollment_no"] = str(mapped["enrollment_no"]).strip().upper()

        if "dob" in mapped and mapped["dob"]:
            parsed = _parse_date(mapped["dob"])
            if parsed is None:
                errors.append({"field": "dob", "code": "invalid_date"})
            else:
                mapped["dob"] = parsed

        if "enrolled_year" in mapped and mapped["enrolled_year"]:
            try:
                yr = int(str(mapped["enrolled_year"]).strip())
                mapped["enrolled_on"] = datetime(yr, 1, 1, tzinfo=timezone.utc).date()
            except Exception:
                pass

        if "mobile" in mapped and mapped["mobile"]:
            digits = re.sub(r"\D", "", str(mapped["mobile"]))
            if len(digits) < 10:
                errors.append({"field": "mobile", "code": "invalid"})
            else:
                mapped["mobile"] = "+" + digits if not digits.startswith("+") else digits

        return mapped, errors


# ---------- module-level helpers -------------------------------------------

def _detect_type(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".xlsx"):
        return "xlsx"
    if lower.endswith(".csv"):
        return "csv"
    raise Conflict("only .xlsx or .csv files are supported")


def _content_type(t: str) -> str:
    return {
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv": "text/csv",
    }[t]


def _parse(content: bytes, source_type: str) -> list[dict]:
    if source_type == "csv":
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        return [{k.strip(): v for k, v in row.items() if k} for row in reader]

    wb = load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    try:
        header = [str(v).strip() if v is not None else "" for v in next(rows)]
    except StopIteration:
        return []
    out: list[dict] = []
    for row in rows:
        if row is None or all(v is None for v in row):
            continue
        entry: dict[str, Any] = {}
        for h, v in zip(header, row):
            if h:
                entry[h] = _cell(v)
        out.append(entry)
    return out


def _cell(v: Any) -> Any:
    if isinstance(v, datetime):
        return v.date().isoformat()
    return v


def _clean(v: Any) -> Any:
    if isinstance(v, str):
        return v.strip()
    return v


_DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d.%m.%Y")


def _parse_date(value: Any):
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat() if hasattr(value, "year") else str(value)
        except Exception:
            pass
    s = str(value).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _is_image(name: str) -> bool:
    return name.lower().endswith((".jpg", ".jpeg", ".png"))


def _normalize_stem(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def _column_for_field(mapping: dict[str, str], target: str) -> str | None:
    for col, field in mapping.items():
        if field == target:
            return col
    return None
