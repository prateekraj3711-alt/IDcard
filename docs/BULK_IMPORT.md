# Bulk Import Pipeline

The super admin can onboard entire schools without the mobile app by uploading a spreadsheet plus a photo folder, mapping columns, and committing.

## Overview

```
CSV / Excel                              Photo Folder (ZIP)
(headers on row 1)                       (filename = enrollment_no.jpg)
      │                                          │
      ▼                                          ▼
  Upload spreadsheet   ─────────────►  Attach photos
  POST /bulk-imports                    POST /bulk-imports/{id}/photos
  (parses + suggests                    (matches filenames against
   column mapping)                       enrollment_no on each row)
      │
      ▼
  Column mapping UI
  (dashboard shows detected columns
   with dropdowns → student fields)
      │
      ▼
  Commit
  POST /bulk-imports/{id}/commit
  ├── validates each row
  ├── creates Student rows (client_uuid generated server-side)
  ├── writes Photo rows with is_primary=true when photo matched
  └── returns { imported, failed, photos_matched }
```

## Expected Sheet Format

The sample sheet used by field partners has the following header row:

| Header       | Maps to (student field) |
|--------------|--------------------------|
| Ph No.       | `photo_hint` — a local path or filename hint used to prefer-match photos |
| Student Name | `name` |
| Enr No.      | `enrollment_no` |
| Enr          | `enrolled_year` (extracts YYYY) |
| DOB          | `dob` |
| Father's Name| `father_name` |
| Mother's Name| `mother_name` |
| Address      | `address` |
| Mobile       | `mobile` |

Any custom headers can be mapped on the dashboard — the auto-detected mapping is a starting point, not a lock.

## Photo Matching

- User uploads a ZIP archive of the photo folder.
- Server iterates entries and indexes by the filename **stem, lowercased, alphanumerics only**.
  - `DPS2025-0421.jpg` → key `dps20250421`
  - `4998.JPG` → key `4998`
- For each row, the enrollment number is normalized the same way; if a photo matches, the object is written to `s3://…/imports/{import_id}/photos/{enrollment}.jpg`.
- If the enrollment doesn't match but the `photo_hint` column carries a full path (`D:\ID Card\...\DSC04998.JPG`), the file stem is used as a fallback key.

## API

### `POST /bulk-imports` (multipart)
Fields: `school_id` (form), `file` (xlsx or csv). Response: `BulkImportPreview` with sample rows + suggested column mapping.

### `POST /bulk-imports/{id}/photos` (multipart)
Field: `file` (ZIP). Response: `{ photos_uploaded, photos_matched }`.

### `POST /bulk-imports/{id}/commit`
```json
{
  "column_mapping": { "Student Name": "name", "Enr No.": "enrollment_no", ... },
  "default_class_id": "…",
  "default_section_id": "…"
}
```

### `GET /bulk-imports/{id}/rows?status_filter=invalid`
Row-level status for QA before or after commit.

## Validation Rules

- `name` required
- `enrollment_no` required (upper-cased, non-empty)
- `dob` must parse from any of: `YYYY-MM-DD`, `DD-MM-YYYY`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD.MM.YYYY`
- `mobile` must have ≥ 10 digits after stripping non-digits; result normalized to `+…`
- Duplicate `enrollment_no` per school still enforced at the DB layer (partial unique index) — a duplicate row lands in `bulk_import_rows.errors` with code `duplicate`.

## Failure Handling

- Bad row → `BulkImportRow.status = invalid`, `errors[]` populated. The import continues.
- Storage failure on a single photo → its row stays without `photo_storage_key`; the row still commits (photo can be added later via the standard photo flow).
- Whole import failure (parse error, file too large) → `BulkImport.status = failed`, `error` populated.

## Limits

- Spreadsheet: 20 MB, ~50 k rows in practice.
- Photo ZIP: 500 MB, extracted server-side (streamed).
- Anything larger — split into multiple imports.

## Idempotency

Every commit creates fresh `Student` rows. To re-run against the same sheet safely, either soft-delete the previous batch first or add a unique constraint on your source column and let the DB reject duplicates (which land as `invalid` rows).
