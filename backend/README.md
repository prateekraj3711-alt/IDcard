# Backend — FastAPI

## Quick start (local dev)

```bash
cp .env.example .env
docker compose up -d

python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python -m scripts.init_db
python -m scripts.create_super_admin \
    --email admin@example.com \
    --full-name "Site Admin" \
    --password 'ChangeMe123!'
python -m scripts.seed_demo             # optional: 1 school + 1 teacher + 3 students + 1 template

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Visit http://localhost:8000/docs. Full walkthrough (with the web + Android
side) is in [../docs/TESTING_GUIDE.md](../docs/TESTING_GUIDE.md).

## Scripts

| Script | Purpose |
|---|---|
| `scripts/init_db.py` | Dev-only: enable `pg_trgm` / `citext`, create every table from `Base.metadata`. Idempotent. |
| `scripts/create_super_admin.py` | Insert the first super-admin. Prints (or accepts) the password. |
| `scripts/seed_demo.py` | 1 school + 1 teacher + 3 students + 1 default template — mirrors the demo scenarios in the testing guide. |

For real deployments, use Alembic migrations (`alembic revision --autogenerate -m "..."`, `alembic upgrade head`) instead of `init_db`.

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
    └── routers/                # auth, schools, teachers, students, photos, sync,
                                #   id_cards, bulk_imports, templates, id_card_jobs
scripts/                        # init_db, create_super_admin, seed_demo
```

## Notes

- Tenant isolation: `ensure_same_school(user, school_id)` — enforced in each service. School id comes from the JWT (`sid`), never from request bodies.
- Idempotent creates: `POST /students` upserts by `client_uuid` (device-generated).
- Photos: presigned PUT (S3/MinIO); server verifies size + hash on complete.
- ID card generation returns a job id; real rendering runs in a Celery worker (Playwright headless Chromium) — outlined in `services/id_card_jobs.py`.
