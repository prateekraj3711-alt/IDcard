# Deployment Architecture

## Recommended Cloud (AWS)

```
Route 53 (DNS)
   │
   ├── api.idcard.example.com  ─►  CloudFront ─►  ALB ─►  ECS Fargate (FastAPI, 3+ tasks)
   │                                                     │
   │                                                     ├── RDS PostgreSQL 15 (Multi-AZ, read replica)
   │                                                     ├── ElastiCache Redis (cluster mode)
   │                                                     ├── S3 (photos-bucket, private)
   │                                                     ├── S3 (id-cards-bucket, private)
   │                                                     └── SQS/Redis  ─►  Celery workers (ECS Fargate)
   │
   ├── app.idcard.example.com  ─►  CloudFront ─►  S3 (dashboard static build)
   │
   └── cdn.idcard.example.com  ─►  CloudFront ─►  S3 (photos, signed URLs)
```

Alternative (Cloudflare-first, lower cost):
- Cloudflare Pages for dashboard
- Cloudflare R2 for object storage
- Cloudflare Workers Cache in front of the API for read-heavy endpoints
- Fly.io / Render for API + workers
- Neon or Supabase Postgres
- Upstash Redis

## Environments

| Env | Purpose | DB | Storage |
|---|---|---|---|
| dev | local Docker | postgres container | MinIO |
| staging | integration | small RDS | S3 (staging bucket) |
| prod | live | Multi-AZ RDS + replica | S3 (versioned, cross-region replica) |

## Container Images

- **api**: `python:3.12-slim` + `uvicorn[standard]` + `gunicorn` (4 workers × 2 threads default; tune per instance size).
- **worker**: same image, entrypoint `celery -A app.workers.celery_app worker --concurrency=4`.
- **beat**: `celery beat` scheduling nightly cleanups.

Multi-stage Dockerfile keeps final image < 200 MB.

## Config Management

- 12-factor: everything via env vars.
- Secrets from AWS Secrets Manager, injected as env at task start.
- Non-secret config in SSM Parameter Store.

## CI/CD (GitHub Actions)

```
push main
  ├── lint (ruff, mypy, eslint, ktlint)
  ├── test (pytest, jest, junit)
  ├── build:
  │     ├── api  → ECR
  │     ├── dashboard → static bundle → S3
  │     └── android → AAB uploaded as artifact + Play Store internal track
  └── deploy staging (ECS deploy)
        └── manual approval → deploy prod (blue/green)
```

## Migrations

- Alembic migrations run as a one-off ECS task before deploying new API tasks.
- Additive-only during transition; deprecate → drop in a later release.

## Scaling

| Layer | Trigger | Action |
|---|---|---|
| API | CPU > 60% for 5 min | +1 task, up to 20 |
| Worker | Queue depth > 100 | +1 task, up to 10 |
| DB | Read replica CPU > 60% | Add replica |
| Redis | Memory > 70% | Vertical scale (or add shard) |

## Backups

- **RDS**: automated daily snapshots (7-day retention), + cross-region weekly.
- **S3**: object versioning + lifecycle to Glacier at 90 days for old ID cards.
- **Restore drill**: quarterly; runbook in `ops/runbooks/restore-db.md`.

## Observability

- Metrics: CloudWatch + Grafana; RED (rate, errors, duration) per route.
- Traces: OpenTelemetry → Tempo/Jaeger.
- Logs: structured JSON → CloudWatch Logs → Loki (or CloudWatch Insights).
- Uptime: external check on `GET /healthz`.

## Health Endpoints

- `GET /healthz` — liveness, always 200 if process is up.
- `GET /readyz` — checks DB, Redis, S3 access; used by ALB.

## Networking

- API tasks in private subnets; egress via NAT for external calls.
- RDS + Redis in isolated subnets with SGs restricted to API/worker SGs.
- WAF (AWS WAF v2) in front of CloudFront with managed rulesets.

## Cost Model (Rough, 100k students, moderate load)

- ECS Fargate api: 3 × 0.5 vCPU / 1 GB — ~$60/mo
- ECS Fargate worker: 2 × 0.5 vCPU / 1 GB — ~$40/mo
- RDS db.t4g.medium Multi-AZ — ~$120/mo
- Redis cache.t4g.micro — ~$15/mo
- S3 storage 50 GB + requests — ~$5/mo
- CloudFront egress — depends; ~$15/mo at typical traffic
- ALB — ~$18/mo
- **Total baseline** — ~$275/mo, scales linearly with photo volume.
