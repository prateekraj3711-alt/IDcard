# System Architecture

## High-Level Diagram

```
                                 ┌─────────────────────────────┐
                                 │   Admin Dashboard (React)    │
                                 │        Super Admin            │
                                 └──────────────┬──────────────┘
                                                │ HTTPS/JSON (JWT)
        ┌──────────────────────┐                │
        │  Android App (Kotlin)│───────────┐    │
        │  Teachers            │  HTTPS/   │    │
        │  Offline-first (Room)│  Multipart│    │
        └──────────────────────┘           │    │
                                           ▼    ▼
                                   ┌────────────────────┐
                                   │   API Gateway /    │
                                   │   Load Balancer    │
                                   │   (ALB / Nginx)    │
                                   └────────┬───────────┘
                                            │
                     ┌──────────────────────┼──────────────────────┐
                     ▼                      ▼                      ▼
             ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
             │  FastAPI App  │      │  FastAPI App  │      │  FastAPI App  │
             │  (Uvicorn +   │  ..  │  (Uvicorn +   │  ..  │  (Uvicorn +   │
             │   Gunicorn)   │      │   Gunicorn)   │      │   Gunicorn)   │
             └───────┬───────┘      └───────┬───────┘      └───────┬───────┘
                     │                      │                      │
        ┌────────────┼──────────────────────┼──────────────────────┼─────────────┐
        │            ▼                      ▼                      ▼             │
        │    ┌───────────────┐      ┌───────────────┐      ┌───────────────┐    │
        │    │  PostgreSQL   │      │  Redis        │      │  Object Store │    │
        │    │  Primary +    │      │  Cache /      │      │  S3 / R2      │    │
        │    │  Read replica │      │  Rate limit   │      │  photos, PDFs │    │
        │    └───────────────┘      └───────────────┘      └───────────────┘    │
        └─────────────────────────────────────────────────────────────────────────┘
                                            ▲
                                            │
                                   ┌────────┴────────┐
                                   │  Celery/RQ      │
                                   │  ID Card Gen,   │
                                   │  Bulk Export    │
                                   └─────────────────┘
```

## Layered Architecture

### Backend (FastAPI, Clean Architecture)

```
app/
├── api/            # HTTP layer — routers, dependencies, request/response
├── core/           # Cross-cutting — config, security, logging
├── domain/         # Entities, value objects, domain events (pure Python)
├── services/       # Use-case orchestration (application layer)
├── infrastructure/ # DB models, repositories, storage adapters, JWT
└── workers/        # Celery tasks (ID card render, bulk export, virus scan)
```

**Dependency direction:** `api → services → domain ← infrastructure`. The domain layer imports nothing.

### Android (MVVM + Clean)

```
app/src/main/java/com/schoolapp/idcard/
├── data/
│   ├── local/       # Room DAOs, entities, TypeConverters
│   ├── remote/      # Retrofit interfaces, DTOs, interceptors
│   └── repository/  # Single-source-of-truth, exposes Flow<T>
├── domain/
│   ├── model/       # Domain models (photo-independent)
│   └── usecase/     # Business rules (AddStudent, SyncPending, ...)
├── ui/
│   ├── auth/        # Login screen + ViewModel
│   ├── students/    # List, Detail, Add/Edit
│   ├── camera/      # CameraX capture + crop
│   └── sync/        # Sync status
├── worker/          # WorkManager: SyncStudentsWorker, UploadPhotoWorker
├── di/              # Hilt modules
└── util/            # Extensions, image compression, connectivity
```

### Admin Dashboard (React + TS)

```
src/
├── api/           # Axios client + typed endpoints (React Query)
├── auth/          # Auth context, protected routes, token refresh
├── components/    # Reusable UI (DataTable, PhotoCropper, IdCardPreview)
├── pages/         # Route-level screens
├── hooks/         # Custom hooks
├── types/         # Shared TS types (mirrored from OpenAPI)
└── theme/         # MUI theme + design tokens
```

## Design Principles

1. **Offline-first mobile** — Room is source of truth; server sync is eventually consistent.
2. **Single writer per record** — each student has a `client_uuid` generated on device; server upserts by UUID to prevent duplicates.
3. **Idempotent APIs** — every write accepts an `Idempotency-Key` header (checked against Redis for 24h).
4. **Async heavy work** — ID card rendering, bulk PDF, and virus scanning go through a queue.
5. **Signed upload URLs** — Android uploads photos directly to S3/R2 via presigned PUT, keeping app servers thin.
6. **Row-level tenancy** — every query on students/photos filters by `school_id` from the JWT claim; enforced at the service layer with a decorator. Two roles only: `super_admin` (cross-school, all admin actions including provisioning teacher credentials) and `teacher` (single-school CRUD).
7. **Audit everything mutating** — insert an audit-log row in the same transaction as the write.

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend framework | FastAPI | Async, first-class OpenAPI, low overhead |
| DB | PostgreSQL 15 | JSONB for template config, GIN indexes for search, mature |
| ORM | SQLAlchemy 2.0 (async) | Explicit, unit-of-work, migrations via Alembic |
| Object storage | S3 (or R2) | Presigned URLs → no bytes through API tier |
| Cache | Redis | Rate limiting, idempotency keys, hot lookups |
| Queue | Celery + Redis | ID card render (headless Chromium / ReportLab) |
| Mobile local DB | Room | AndroidX standard, coroutines/Flow support |
| Mobile HTTP | Retrofit + OkHttp | Interceptor stack for auth + retry |
| Mobile background | WorkManager | Constraint-based sync, survives reboot |
| Mobile DI | Hilt | Compile-time, first-party |
| ID card render | HTML template + Playwright (server) | Pixel-perfect, versionable templates |
| QR code | `qrcode` (Python) / `zxing` fallback | Deep link to `/students/:id` |

## Failure Modes

- **Network flaps mid-upload** — presigned URL with `Content-MD5` prevents partial acceptance; worker retries with backoff.
- **Duplicate submissions** — `client_uuid` unique constraint + `Idempotency-Key`.
- **JWT theft** — short-lived access (15 min) + rotating refresh (7 days); refresh tokens hashed in DB, revocable per device.
- **Photo tampering** — SHA-256 stored server-side; virus scan before making public via CDN.
- **DB hot rows** — student search hits GIN trigram index, not sequential scan.

See individual docs for depth on auth flow, sync, and image upload.
