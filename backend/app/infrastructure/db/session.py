from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

# NullPool opens a fresh asyncpg connection per checkout and closes it on
# return. It removes every stale-connection failure mode we've been chasing:
#   - pool_pre_ping triggering MissingGreenlet on Neon-idled connections
#   - pool_recycle races where a connection was fine on borrow but died mid-tx
#   - Render free-tier processes with only 1 worker anyway
# The extra ~5–15 ms per request is a fine trade for reliability. Applies
# equally to Neon, Supabase, and Cockroach Serverless.


def _connect_args() -> dict:
    """Cloud Postgres providers (Neon, Supabase, Cockroach Cloud) all require
    TLS. asyncpg doesn't pick up the libpq-style `sslmode` URL param, so we
    detect a known cloud host and pass `ssl="require"` explicitly.
    Local Postgres works with the default (no SSL negotiated)."""
    url = settings.database_url.lower()
    cloud_markers = (
        "cockroachlabs.cloud",
        "neon.tech",
        "supabase.co",
        "supabase.com",
        "render.com",
        "aivencloud.com",
    )
    if any(m in url for m in cloud_markers):
        return {"ssl": "require"}
    return {}


engine = create_async_engine(
    settings.database_url,
    poolclass=NullPool,
    future=True,
    connect_args=_connect_args(),
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
