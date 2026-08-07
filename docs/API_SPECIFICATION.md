# API Specification

Base URL: `https://api.idcard.example.com/api/v1`

All endpoints return JSON. Errors use RFC 7807 problem+json.

Headers required on writes:
- `Authorization: Bearer <access_token>`
- `Idempotency-Key: <uuid>` (recommended for POST/PUT from the mobile app)

## Auth

### POST `/auth/login`
Teacher login using school code + username. Admin login using email.

Request:
```json
{
  "school_code": "DPS-DEL-01",
  "username": "priya.sharma",
  "password": "••••••••",
  "device_id": "AND-42b1-9f3c"
}
```
Response 200:
```json
{
  "access_token": "eyJhbGc…",
  "refresh_token": "def502…",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "3f0…",
    "full_name": "Priya Sharma",
    "role": "teacher",
    "school": { "id": "1a…", "code": "DPS-DEL-01", "name": "DPS Delhi" }
  }
}
```

### POST `/auth/refresh`
```json
{ "refresh_token": "def502…", "device_id": "AND-42b1-9f3c" }
```
Rotates the refresh token; old one is revoked.

### POST `/auth/logout`
Revokes the current refresh token.

### GET `/auth/me`
Returns the current user.

## Schools

### GET `/schools`
Query params: `q`, `page`, `page_size` (default 25, max 100), `is_active`.
Super admin only.

### POST `/schools`
```json
{
  "code": "DPS-DEL-01",
  "name": "Delhi Public School",
  "address": "…",
  "city": "New Delhi",
  "state": "DL",
  "pincode": "110001",
  "phone": "+91…",
  "email": "office@dps.edu",
  "principal_name": "…"
}
```

### GET `/schools/{id}`
### PATCH `/schools/{id}`
### DELETE `/schools/{id}` (soft delete)

## Classes & Sections

### GET `/schools/{school_id}/classes`
### POST `/schools/{school_id}/classes`  `{ "name": "Grade 5", "ordering": 5 }`
### GET `/classes/{class_id}/sections`
### POST `/classes/{class_id}/sections`  `{ "name": "A" }`

## Teachers

### GET `/teachers`  (super admin: all; school admin: own school)
### POST `/teachers`
```json
{
  "school_id": "1a…",
  "full_name": "Priya Sharma",
  "username": "priya.sharma",
  "email": "priya@dps.edu",
  "password": "TempP@ss123",
  "phone": "+91…"
}
```
### PATCH `/teachers/{id}`
### POST `/teachers/{id}/reset-password`
### DELETE `/teachers/{id}` (soft)

## Students

Teachers can only read/write within their assigned school (enforced from JWT `school_id` claim, not request body).

### POST `/students`
Creates or upserts (by `client_uuid`).

Request:
```json
{
  "client_uuid": "b2c1c2f4-…",
  "school_id": "1a…",
  "class_id": "…",
  "section_id": "…",
  "enrollment_no": "DPS2025-0421",
  "roll_no": "17",
  "name": "Aarav Verma",
  "father_name": "Rajesh Verma",
  "mother_name": "Neha Verma",
  "dob": "2014-08-11",
  "blood_group": "B+",
  "gender": "male",
  "address": "Sector 21, Noida",
  "mobile": "+919812345678",
  "enrolled_on": "2025-04-01",
  "status": "submitted"
}
```
Response 201:
```json
{
  "id": "7d8…",
  "client_uuid": "b2c1c2f4-…",
  "school_id": "1a…",
  "enrollment_no": "DPS2025-0421",
  "status": "submitted",
  "created_at": "2026-08-07T09:12:33Z",
  "updated_at": "2026-08-07T09:12:33Z"
}
```

### GET `/students`
Query: `q`, `school_id`, `class_id`, `section_id`, `status`, `page`, `page_size`, `sort` (`name`, `-created_at`, …).

Response 200:
```json
{
  "items": [ { "id": "…", "name": "…", "class": "Grade 5", "section": "A", "primary_photo_url": "…" } ],
  "page": 1,
  "page_size": 25,
  "total": 4213
}
```

### GET `/students/{id}`
Returns full profile including photo URL and QR payload.

### PATCH `/students/{id}`
Only fields provided are updated. Teacher can only patch students in their school and with `status ∈ {draft, submitted}`.

### DELETE `/students/{id}` (soft; super admin only for `active`)

### POST `/students/search`
Structured search when the querystring version is not enough.
```json
{
  "school_ids": ["…"],
  "class_ids": ["…"],
  "text": "Aarav Ver",
  "filters": { "blood_group": "B+", "enrolled_after": "2025-01-01" },
  "sort": [{ "field": "name", "dir": "asc" }],
  "page": 1,
  "page_size": 50
}
```

## Photos

### POST `/students/{id}/photo/upload-url`
Returns a presigned PUT URL for the mobile client to upload directly to object storage.
```json
{
  "url": "https://s3.amazonaws.com/…?X-Amz-Signature=…",
  "storage_key": "schools/1a…/students/7d8…/9f2e.jpg",
  "expires_in": 300,
  "required_headers": { "Content-Type": "image/jpeg", "x-amz-server-side-encryption": "AES256" }
}
```

### POST `/students/{id}/photo/complete`
Called after a successful PUT. Server verifies size / hash and marks photo primary.
```json
{
  "storage_key": "schools/1a…/students/7d8…/9f2e.jpg",
  "size_bytes": 128340,
  "sha256": "3f5a…",
  "width": 480,
  "height": 640
}
```
Response 201 mirrors the created photo.

### GET `/students/{id}/photo`
Returns a fresh signed CDN URL (short TTL).

## Offline Sync

### POST `/sync/batch`
Bulk upsert used by the mobile app to drain pending records.
```json
{
  "device_id": "AND-42b1-9f3c",
  "operations": [
    { "op": "create", "type": "student", "client_uuid": "…", "payload": { … } },
    { "op": "update", "type": "student", "client_uuid": "…", "payload": { … } }
  ]
}
```
Response 200:
```json
{
  "results": [
    { "client_uuid": "…", "status": "uploaded", "server_id": "7d8…" },
    { "client_uuid": "…", "status": "failed",   "error":  "duplicate enrollment_no" }
  ]
}
```

The server records each result in `sync_logs`.

## ID Cards

### POST `/id-cards/generate`
Enqueues a render job.
```json
{
  "student_ids": ["7d8…", "…"],   // OR class_id / school_id / section_id
  "template_id": "…",
  "format": "pdf",                 // "pdf" | "png"
  "layout": "single" | "a4-sheet"
}
```
Response 202:
```json
{ "job_id": "job_01H…", "status": "queued" }
```

### GET `/id-cards/jobs/{job_id}`
```json
{ "job_id": "…", "status": "done", "download_url": "https://…/idcards/job_01H….pdf", "expires_at": "…" }
```

### GET `/id-cards/{student_id}/preview`
Returns rendered PNG bytes (streamed) — useful for the dashboard preview panel.

### GET `/templates` / POST `/templates` / PUT `/templates/{id}`

## Exports

### POST `/exports/students.xlsx`
```json
{ "school_id": "…", "class_id": "…", "columns": ["name", "father_name", "enrollment_no", "mobile"] }
```
Returns a job; poll `/exports/{job_id}`.

## Analytics

### GET `/analytics/overview`
Super admin summary — total schools, students, uploads today, sync failures.

### GET `/analytics/school/{id}`

## Error Model

```json
{
  "type": "https://api.idcard.example.com/errors/validation",
  "title": "Validation error",
  "status": 422,
  "detail": "enrollment_no already exists for this school",
  "instance": "/api/v1/students",
  "errors": [ { "field": "enrollment_no", "code": "duplicate" } ]
}
```

Standard codes: `400`, `401`, `403`, `404`, `409` (conflict / duplicate), `422` (validation), `429` (rate limit), `500`.

## Rate Limits

| Endpoint class | Limit |
|---|---|
| `POST /auth/login` | 10/min/IP + 5/min/user |
| Photo upload URL | 60/min/user |
| `POST /sync/batch` | 30/min/device |
| Read endpoints | 300/min/user |
