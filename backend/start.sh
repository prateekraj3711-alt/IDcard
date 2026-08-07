#!/bin/sh
set -e

# One-time bootstrap on every container start — idempotent.
# Creates the schema and, when INITIAL_ADMIN_* env vars are set, the first
# super admin. Runs before gunicorn so failures block traffic.
python -m scripts.bootstrap

exec gunicorn app.main:app \
    -k uvicorn.workers.UvicornWorker \
    -w 4 \
    -b 0.0.0.0:8000 \
    --access-logfile -
