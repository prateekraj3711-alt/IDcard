"""
Development-only DB bootstrap.

Creates the pg_trgm + citext extensions, then creates every table declared on
`Base.metadata`. Use this for local testing and E2E CI. For production,
generate Alembic migrations (`alembic revision --autogenerate -m "..."`) and
run `alembic upgrade head` instead.

Usage:
    python -m scripts.init_db

Idempotent — running twice is safe.
"""
from __future__ import annotations

import asyncio

from sqlalchemy import text

from app.core.config import settings
from app.infrastructure.db.base import Base
from app.infrastructure.db import models  # noqa: F401  (register all models)
from app.infrastructure.db.session import engine


async def main() -> None:
    print(f"→ Connecting to {settings.database_url.rsplit('@', 1)[-1]}")
    async with engine.begin() as conn:
        for ext in ("pg_trgm", "citext"):
            await conn.execute(text(f'CREATE EXTENSION IF NOT EXISTS "{ext}"'))
        await conn.run_sync(Base.metadata.create_all)
    print("✓ Schema created (or already up-to-date)")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
