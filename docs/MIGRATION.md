# IDcard — Lovable + Lovable Cloud migration

## 1. Architecture

```text
Browser (desktop / Android Chrome, installable)      Android app (Kotlin, APK)
              |                                              |
              |  direct, RLS-protected                       |  /api/public/v1/* (same contract as before)
              v                                              v
        Lovable app (TanStack Start: web UI + server routes/functions)
              |
              v
        Lovable Cloud
          ├── PostgreSQL   (schools, students, photos, id_cards, templates, jobs, imports, logs)
          ├── Auth         (email/password; username + phone login resolved server-side)
          ├── Storage      (private buckets: student-photos, id-cards)
          └── RLS policies (per-school isolation)
```

Removed: FastAPI backend, Alembic, Redis, Celery workers, S3/R2/MinIO, presigned URLs, Render (`render.yaml`), Docker deploy.

- **Photos**: validated → resized to 720×960 JPEG (no upscaling) → compressed toward ~300 KB → SHA-256 duplicate check → uploaded to `student-photos/{school_id}/{student_id}/{sha256}.jpg` → metadata recorded via the `record_student_photo` database function.
- **ID cards**: rendered with the original canvas renderer + pdf-lib (same template/Konva design system), uploaded to `id-cards/{school_id}/{student_id}/{card_id}.pdf` plus a `{card_id}.png` preview (mobile browsers cannot show PDFs inline). Metadata in `id_cards`. Bulk batches: `id-cards/{school_id}/batches/{job_id}.pdf`, tracked in `id_card_jobs`.
- **Bulk import**: CSV/XLSX + photo ZIP parsed in the browser; rows staged in `bulk_import_rows`, then imported.
- **Accounts**: admin/teacher management runs in server functions (service role stays server-side, caller verified as super admin first).

## 2. Database tables
`schools, profiles, user_roles, classes, sections, students, photos, id_card_templates, id_cards, id_card_jobs, bulk_imports, bulk_import_rows, sync_logs, audit_logs`.
Roles live in `user_roles` (`super_admin`, `teacher`). SQL is in `supabase/migrations/`.

## 3. Storage buckets & policies
| Bucket | Public | Max size |
|---|---|---|
| `student-photos` | no | 5 MB |
| `id-cards` | no | 50 MB |

Policies on `storage.objects` (both buckets): select/insert/update/delete only when the first folder of the path is the caller's school (`can_access_school_path`), or caller is super admin. `id-cards/templates/*` is readable by any signed-in user (template artwork). Files are read with short-lived signed URLs.

Verified: a School B teacher gets *not found / RLS denied* on School A photos, cards, students, and cannot upload into School A folders.

## 4. Environment variables
Frontend (public, auto-provided): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
Server only (auto-provided by Lovable Cloud): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Obsolete & removed: `AWS_*`, `S3_*`, `R2_*`, `CLOUDFLARE_*`, `MINIO_*`, `REDIS_URL`, `CELERY_*`, `DATABASE_URL`, `JWT_SECRET`, `VITE_API_BASE_URL`.
Android build: `API_BASE_URL` (optional; defaults to the published app's `/api/public/v1/`).

## 5. Deploy
1. Lovable Cloud is already enabled; migrations and buckets are applied.
2. Click **Publish** in Lovable.
3. Open `/login` → "First-time setup" creates the first super admin (works only while no admin exists).
4. Android APK: push to GitHub (main) → workflow `Android — build & publish APK` uploads `idcard-teacher-*.apk` as an artifact/release. Install on the phone (allow "install unknown apps").
5. Web on Android: open the published site in Chrome → menu → **Install app / Add to Home screen**.

## 6. Android API contract (base `https://<app>/api/public/v1/`)
All authenticated calls send `Authorization: Bearer <access_token>`. A `401` means refresh the token.

`POST auth/login`
```json
{ "email": "t@school.in", "password": "…" }        // or "username"/"phone" + optional "school_code"
→ 200 { "access_token": "…", "refresh_token": "…", "token_type": "bearer", "expires_in": 3600,
        "user": { "id": "uuid", "full_name": "…", "email": "…", "role": "teacher",
                  "school": { "id": "uuid", "code": "DPS01", "name": "…" } } }
```
`POST auth/refresh` `{ "refresh_token": "…" }` → `{ access_token, refresh_token, token_type, expires_in }`
`POST auth/signup/teacher` `{ school_code, full_name, email, phone?, password(≥8) }` → 201 same as login
`GET schools/available` → `[{ "id", "code", "name" }]`
`POST students` (header `Idempotency-Key` optional; idempotent on `client_uuid`)
```json
{ "client_uuid": "uuid", "school_id": "uuid", "enrollment_no": "A12", "name": "Aarav", "roll_no": "7", "status": "submitted" }
→ 201 (created) / 200 (replay) student row incl. "id"     409 duplicate enrollment · 403 other school · 422 invalid
```
`POST students/{id}/photo` — `multipart/form-data`, field `file` = JPEG ≤ 5 MB
```json
→ 201 { "photo_id": "uuid", "photo_path": "school/student/sha.jpg", "sha256": "…", "size_bytes": 16258, "width": 720, "height": 960, "duplicate": false }
→ 200 { …, "duplicate": true }    404 not found/other school · 413 too big · 415 not JPEG
```
Replaces the old `photo/upload-url` + S3 `PUT` + `photo/complete` three-step flow.

## 7. End-to-end checklist (all passed in testing)
- [x] First admin setup → login
- [x] Create school(s)
- [x] Create student
- [x] Upload photo → shows on profile; refresh → still there
- [x] Re-upload same photo → "already the current photo" message
- [x] Generate ID card → preview → refresh → card listed
- [x] Download PDF
- [x] Sign out → sign in → data still there
- [x] Android endpoints: login, refresh, schools, create student, photo upload, duplicate, cross-school photo denied
- [x] School B user cannot read/write School A files or rows

## 8. Known limitations
- Card/PDF rendering happens in the user's browser (no server renderer); large bulk batches depend on device memory.
- New Android APK must be built via GitHub Actions (connect the project to GitHub first); this sandbox cannot compile Android.
- Email confirmation is on for any future self-service email signup; admin-created and teacher-code accounts are pre-confirmed.
