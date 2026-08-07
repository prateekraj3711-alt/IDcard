# School Student Enrollment & ID Card Management System

A production-grade platform for capturing student information from schools and generating ID cards at scale.

## Components

| Component | Stack | Path |
|-----------|-------|------|
| Android App (Teachers) | Kotlin, Jetpack Compose, MVVM, Room, Retrofit, CameraX, WorkManager, Hilt | `android/` |
| Backend API | FastAPI, PostgreSQL, SQLAlchemy, Alembic, JWT, S3/R2 | `backend/` |
| Admin Dashboard | React 18, TypeScript, Material UI 5, Vite, React Query | `dashboard/` |

## Documentation

- **[Testing Guide (web + Android)](docs/TESTING_GUIDE.md)** ← start here to run it locally
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Database Schema (ER)](docs/DATABASE_SCHEMA.md)
- [API Specification](docs/API_SPECIFICATION.md)
- [Authentication Flow](docs/AUTH_FLOW.md)
- [Offline Sync Strategy](docs/OFFLINE_SYNC.md)
- [Image Upload Strategy](docs/IMAGE_UPLOAD.md)
- [Bulk Import Pipeline](docs/BULK_IMPORT.md)
- [ID Card Template Editor](docs/TEMPLATE_EDITOR.md)
- [Security](docs/SECURITY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Future Enhancements](docs/FUTURE_ENHANCEMENTS.md)

## Quick Start (Local Dev)

### Backend
```bash
cd backend
cp .env.example .env
docker compose up -d           # Postgres + MinIO (S3-compatible)
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload  # http://localhost:8000
```
OpenAPI: http://localhost:8000/docs

### Dashboard
```bash
cd dashboard
npm install
npm run dev                    # http://localhost:5173
```

### Android
Open `android/` in Android Studio (Iguana+), sync Gradle, run on device (API 24+).

## Scale Targets

- 1,000+ schools
- 100,000+ students
- Concurrent uploads with background sync
- P95 search latency < 200 ms
- Photo pipeline: capture → compress → sign → upload → CDN → ID card

## Roles

- **Super Admin** — full platform control: creates schools, creates teachers (with server-generated username + password returned once), can regenerate teacher passwords, manages templates, sees cross-school analytics.
- **Teacher** — student CRUD + photo capture on their assigned school only. Signs in with school code + generated username + password.
