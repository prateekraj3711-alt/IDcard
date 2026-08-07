"""
Runs on every container boot (called from start.sh before gunicorn).

- Always: enables pg_trgm + citext, creates every table on Base.metadata.
  Idempotent — safe to run on every boot.
- Optional: creates the first super admin if INITIAL_ADMIN_EMAIL and
  INITIAL_ADMIN_PASSWORD are set and no user with that email exists yet.

Both actions log a single line each on success or skip so the Render
deploy log makes it obvious what happened.
"""
from __future__ import annotations

import asyncio
import os

from sqlalchemy import select, text

from app.core.security import hash_password
from app.infrastructure.db.base import Base
from app.infrastructure.db import models  # noqa: F401  (register models)
from app.infrastructure.db.models import User, UserRole
from app.infrastructure.db.session import SessionLocal, engine


async def _init_schema() -> None:
    # Postgres extensions we used to rely on (pg_trgm, citext). CockroachDB
    # doesn't ship either — the models now use a LowerText TypeDecorator that
    # simulates CITEXT in application code, so failing to CREATE EXTENSION
    # is not fatal. Each attempt runs in its own `engine.begin()` block; if
    # the CREATE fails, the transaction rolls back cleanly and the next
    # iteration gets a fresh connection from the pool.
    #
    # NOTE: we deliberately do NOT flip isolation_level to AUTOCOMMIT
    # mid-connection here — on asyncpg that triggers a sync reconnect
    # inside SQLAlchemy's pool checkout which fails with MissingGreenlet.
    for ext in ("pg_trgm", "citext"):
        try:
            async with engine.begin() as conn:
                await conn.execute(text(f'CREATE EXTENSION IF NOT EXISTS "{ext}"'))
        except Exception as exc:  # noqa: BLE001
            print(f"[bootstrap] skip extension {ext}: {type(exc).__name__}")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[bootstrap] schema ok")


async def _ensure_admin() -> None:
    email = os.getenv("INITIAL_ADMIN_EMAIL", "").strip()
    password = os.getenv("INITIAL_ADMIN_PASSWORD", "")
    name = os.getenv("INITIAL_ADMIN_FULL_NAME", "Site Admin").strip() or "Site Admin"

    if not email or not password:
        print("[bootstrap] INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD not set — skipping admin creation")
        return

    async with SessionLocal() as s:
        existing = (
            await s.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing:
            print(f"[bootstrap] super admin '{email}' already exists — skipping")
            return

        s.add(
            User(
                email=email,
                full_name=name,
                password_hash=hash_password(password),
                role=UserRole.super_admin,
                is_active=True,
            )
        )
        await s.commit()
        print(f"[bootstrap] ✓ super admin created: {email}")


async def main() -> None:
    print("[bootstrap] starting…")
    await _init_schema()
    await _ensure_admin()
    await engine.dispose()
    print("[bootstrap] done")


if __name__ == "__main__":
    asyncio.run(main())
