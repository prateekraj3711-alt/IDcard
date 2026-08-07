from __future__ import annotations

import csv
import io
import json
import re
import zipfile
from datetime import date, datetime
from pathlib import PurePosixPath
from typing import Any
from uuid import UUID, uuid4

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, ensure_same_school
from app.core.config import settings
from app.core.errors import Conflict, NotFound, Validation
from app.domain.schemas import (
    DEFAULT_COLUMN_MAPPING,
    FIELD_KEYWORDS,
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
    Class,
    Photo,
    Section,
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
                    raw=_json_safe(raw),
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

    async def attach_photos_from_path(
        self, user: CurrentUser, import_id: UUID, zip_path: str
    ) -> dict:
        """
        Memory-frugal photo ingest. First pass builds a stem → ZipInfo index
        (metadata only, ~100 bytes per entry). Second pass matches each row
        to at most one entry, reads that single entry's bytes, uploads to R2,
        and drops the reference — so peak memory stays around one photo, not
        the whole archive.
        """
        imp = await self._load(import_id, user)
        prefix = f"schools/{imp.school_id}/imports/{imp.id}/photos/"

        matched, uploaded = 0, 0
        client = get_s3_client()
        bucket = settings.s3_bucket_photos

        # Pass 1 — index entry names (no reads).
        stems: dict[str, tuple[Any, str]] = {}
        with zipfile.ZipFile(zip_path) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                name = PurePosixPath(info.filename).name
                if not name or not _is_image(name):
                    continue
                stem = _normalize_stem(PurePosixPath(name).stem)
                stems[stem] = (info, name)

        rows = (
            await self.s.execute(
                select(BulkImportRow).where(BulkImportRow.bulk_import_id == imp.id)
            )
        ).scalars().all()

        mapping = imp.column_mapping or {}
        enrollment_key = _column_for_field(mapping, "enrollment_no")
        photo_hint_key = _column_for_field(mapping, "photo_hint")

        # Pass 2 — reopen the zip for streaming reads of matched entries.
        with zipfile.ZipFile(zip_path) as zf:
            for row in rows:
                enrollment = str(row.raw.get(enrollment_key, "")) if enrollment_key else ""
                hint = str(row.raw.get(photo_hint_key, "")) if photo_hint_key else ""

                candidates = [
                    _normalize_stem(enrollment),
                    _normalize_stem(PurePosixPath(hint).stem) if hint else "",
                    _normalize_stem(hint) if hint else "",
                ]
                found = next((stems[c] for c in candidates if c and c in stems), None)
                if found is None:
                    continue

                info, filename = found
                stem_key = _normalize_stem(
                    enrollment or PurePosixPath(filename).stem or hint
                )
                key = f"{prefix}{stem_key}.jpg"

                with zf.open(info) as f:
                    body = f.read()
                try:
                    client.put_object(
                        Bucket=bucket, Key=key, Body=body, ContentType="image/jpeg"
                    )
                finally:
                    del body   # free ASAP before the next iteration

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

        # Cache classes/sections per school so repeated names in the sheet share a row.
        class_cache: dict[str, UUID] = {}
        section_cache: dict[tuple[UUID, str], UUID] = {}

        async def _get_or_create_class(name: str) -> UUID:
            key = name.strip().lower()
            if key in class_cache:
                return class_cache[key]
            existing = (
                await self.s.execute(
                    select(Class).where(Class.school_id == imp.school_id, Class.name == name.strip())
                )
            ).scalar_one_or_none()
            if existing is None:
                existing = Class(school_id=imp.school_id, name=name.strip(), ordering=0)
                self.s.add(existing)
                await self.s.flush()
            class_cache[key] = existing.id
            return existing.id

        async def _get_or_create_section(class_id: UUID, name: str) -> UUID:
            key = (class_id, name.strip().lower())
            if key in section_cache:
                return section_cache[key]
            existing = (
                await self.s.execute(
                    select(Section).where(Section.class_id == class_id, Section.name == name.strip())
                )
            ).scalar_one_or_none()
            if existing is None:
                existing = Section(class_id=class_id, name=name.strip(), ordering=0)
                self.s.add(existing)
                await self.s.flush()
            section_cache[key] = existing.id
            return existing.id

        imported, failed = 0, 0

        # Every JSONB write below routes through _json_safe. On top of that,
        # disable autoflush across the loop so we never surprise-flush a
        # half-populated ORM state mid-iteration (which was what generated
        # the confusing "date is not JSON serializable" trace even after
        # rows were sanitized).
        self.s.autoflush = False

        for row in rows:
            # Defensive copy — if the persisted row.raw was somehow non-JSON-
            # native (older data or a driver quirk), sanitize before mapping.
            safe_raw = _json_safe(row.raw) if row.raw else {}
            mapped, errors = self._map_row(safe_raw, mapping)
            row.mapped = _json_safe(mapped)
            if errors:
                row.status = BulkImportRowStatus.invalid
                row.errors = _json_safe(errors)
                failed += 1
                continue

            try:
                class_id = req.default_class_id
                section_id = req.default_section_id
                cls_name = mapped.get("class_name")
                sec_name = mapped.get("section_name")
                if cls_name:
                    class_id = await _get_or_create_class(str(cls_name))
                if sec_name and class_id:
                    section_id = await _get_or_create_section(class_id, str(sec_name))

                student = Student(
                    client_uuid=uuid4(),
                    school_id=imp.school_id,
                    class_id=class_id,
                    section_id=section_id,
                    enrollment_no=mapped["enrollment_no"],
                    roll_no=mapped.get("roll_no"),
                    name=mapped["name"],
                    father_name=mapped.get("father_name"),
                    mother_name=mapped.get("mother_name"),
                    dob=_iso_to_date(mapped.get("dob")),
                    blood_group=mapped.get("blood_group"),
                    address=mapped.get("address"),
                    mobile=mapped.get("mobile"),
                    enrolled_on=_iso_to_date(mapped.get("enrolled_on")),
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
                            size_bytes=0,
                            sha256="0" * 64,
                            is_primary=True,
                        )
                    )
                row.status = BulkImportRowStatus.imported
                row.student_id = student.id
                imported += 1
            except Exception as exc:
                # Recover the session so subsequent rows can still be tried.
                await self.s.rollback()
                # Re-mark the failing row on a fresh transaction.
                await self.s.execute(
                    BulkImportRow.__table__.update()
                    .where(BulkImportRow.id == row.id)
                    .values(
                        status=BulkImportRowStatus.failed,
                        errors=_json_safe([{"code": "db_error", "message": str(exc)}]),
                    )
                )
                await self.s.commit()
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
        """Auto-map columns to student fields using both a literal dictionary
        and a token-based keyword matcher so headers like 'S.N.',
        'ENR. NO.', 'FATHER NAME', 'CLASS', 'MOBILE' all resolve."""
        result: dict[str, str] = {}
        for col in columns:
            header = col.strip()
            if header in DEFAULT_COLUMN_MAPPING:
                result[header] = DEFAULT_COLUMN_MAPPING[header]
                continue
            norm = _normalize_stem(header)
            if not norm:
                continue
            matched: str | None = None
            for field, phrases in FIELD_KEYWORDS:
                if any(p in norm for p in phrases):
                    matched = field
                    break
            if matched:
                result[header] = matched
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

        # roll_no comes in as int/float/date sometimes; coerce to str
        if "roll_no" in mapped and mapped["roll_no"] is not None:
            mapped["roll_no"] = _stringify(mapped["roll_no"])

        if "class_name" in mapped and mapped["class_name"] is not None:
            mapped["class_name"] = _stringify(mapped["class_name"])

        if "section_name" in mapped and mapped["section_name"] is not None:
            mapped["section_name"] = _stringify(mapped["section_name"])

        # Dates go into a JSONB column via `row.mapped`, so keep them as ISO
        # strings here — SQLAlchemy can't serialize datetime.date to JSON.
        # They're parsed back to `date` at Student-create time.
        if "dob" in mapped and mapped["dob"]:
            parsed = _parse_date(mapped["dob"])
            if parsed is None:
                errors.append({"field": "dob", "code": "invalid_date"})
            else:
                mapped["dob"] = parsed.isoformat()

        if "enrolled_year" in mapped and mapped["enrolled_year"]:
            try:
                yr = int(re.sub(r"\D", "", str(mapped["enrolled_year"]))[:4] or "0")
                if yr >= 1900:
                    mapped["enrolled_on"] = date(yr, 1, 1).isoformat()
            except Exception:
                pass

        if "mobile" in mapped and mapped["mobile"]:
            digits = re.sub(r"\D", "", _stringify(mapped["mobile"]))
            if len(digits) < 10:
                errors.append({"field": "mobile", "code": "invalid"})
            elif digits.startswith("91") and len(digits) == 12:
                mapped["mobile"] = "+" + digits
            elif len(digits) == 10:
                mapped["mobile"] = "+91" + digits
            else:
                mapped["mobile"] = "+" + digits

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
    """Preserve Excel dates in the human-readable Indian order (dd/mm/yyyy) so
    values that were entered as text like '02/2026' but auto-converted by Excel
    to dates round-trip cleanly. Non-date cells pass through untouched."""
    if isinstance(v, datetime):
        # If the value has no time component and is exactly midnight, treat as date.
        if v.hour == 0 and v.minute == 0 and v.second == 0:
            return v.strftime("%d/%m/%Y")
        return v.strftime("%d/%m/%Y %H:%M")
    if isinstance(v, date):
        return v.strftime("%d/%m/%Y")
    return v


def _clean(v: Any) -> Any:
    if isinstance(v, str):
        return v.strip()
    return v


def _stringify(v: Any) -> str:
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
    "%d/%m/%y", "%d-%m-%y",
    "%m/%d/%Y",
)


def _parse_date(value: Any):
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    s = _stringify(value).strip()
    if not s:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _iso_to_date(value: Any):
    """Coerce an ISO-YYYY-MM-DD string back to a `date` for Student columns.
    Returns None if the value is falsy or unparseable."""
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return date.fromisoformat(str(value))
    except Exception:
        return None


def _json_default(o: Any) -> Any:
    """Fallback used by json.dumps for anything non-serializable."""
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, UUID):
        return str(o)
    return str(o)


def _json_safe(obj: Any) -> Any:
    """
    Force any value through a JSON round-trip so nothing non-serializable
    (date, datetime, UUID, Decimal, custom types, ...) can reach a JSONB
    column. This is deliberately heavy-handed — the alternative was chasing
    per-field bugs where a stray date snuck in and poisoned the session.
    """
    return json.loads(json.dumps(obj, default=_json_default))


def _is_image(name: str) -> bool:
    return name.lower().endswith((".jpg", ".jpeg", ".png"))


def _normalize_stem(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def _column_for_field(mapping: dict[str, str], target: str) -> str | None:
    for col, field in mapping.items():
        if field == target:
            return col
    return None
