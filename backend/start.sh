#!/bin/sh
set -e

# One-time bootstrap on every container start — idempotent.
# Creates the schema and, when INITIAL_ADMIN_* env vars are set, the first
# super admin. Runs before gunicorn so failures block traffic.
python -m scripts.bootstrap

# Number of workers — Render's free tier sets WEB_CONCURRENCY=1 (512 MB
# RAM shared across all workers). Respect that, but let ops override on
# a bigger plan.
WORKERS="${WEB_CONCURRENCY:-2}"

exec gunicorn app.main:app \
    -k uvicorn.workers.UvicornWorker \
    -w "${WORKERS}" \
    -b 0.0.0.0:8000 \
    --timeout 120 \
    --access-logfile -
