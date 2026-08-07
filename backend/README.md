# Backend — FastAPI

## Run locally

```bash
cp .env.example .env
docker compose up -d
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Visit http://localhost:8000/docs.

## Layout

```
app/
├── main.py                     # FastAPI wiring
├── core/                       # config, logging, security, errors
├── domain/                     # Pydantic schemas
├── infrastructure/
│   ├── db/                     # SQLAlchemy models + session
│   └── storage/                # S3 presign helpers
├── services/                   # Use-case orchestration (transactional)
└── api/
    ├── deps.py                 # dependencies: current user, tenant checks
    ├── middleware.py           # request-id, security headers
    ├── rate_limit.py           # Redis fixed-window
    └── routers/                # auth, schools, teachers, students, photos, sync, id_cards
```

## Notes

- Tenant isolation: `ensure_same_school(user, school_id)` — enforced in each service. School id comes from the JWT (`sid`), never from request bodies.
- Idempotent creates: `POST /students` upserts by `client_uuid` (device-generated).
- Photos: presigned PUT (S3/MinIO); server verifies size + optional hash on complete.
- ID card generation returns a job id; real rendering is a Celery worker (Playwright headless Chromium) — outlined in `services/id_cards.py`.
