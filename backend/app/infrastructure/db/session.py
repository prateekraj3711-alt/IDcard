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
    """asyncpg connect kwargs — must ONLY contain arguments asyncpg.connect()
    itself accepts. SQLAlchemy-dialect-level params like
    ``prepared_statement_cache_size`` are handled below via the engine
    constructor, not here — passing them to asyncpg raises TypeError.

    TLS: cloud Postgres (Neon, Supabase, Cockroach Cloud, Aiven, Render)
    requires SSL. asyncpg doesn't read libpq's ``sslmode=`` URL param, so
    we pass ``ssl="require"`` explicitly when the host looks cloud-shaped.

    statement_cache_size: Supabase's *transaction pooler* (pgbouncer in
    transaction mode, port 6543) doesn't hold a Postgres backend across
    statements, so asyncpg's server-side prepared statement cache goes
    stale mid-query and errors with ``prepared statement does not exist``.
    Zero it out on that pooler; the session pooler keeps it on because
    the backend sticks for the session.
    """
    url = settings.database_url.lower()
    args: dict = {}

    cloud_markers = (
        "cockroachlabs.cloud",
        "neon.tech",
        "supabase.co",
        "supabase.com",
        "render.com",
        "aivencloud.com",
    )
    if any(m in url for m in cloud_markers):
        args["ssl"] = "require"

    if _is_supabase_tx_pooler(url):
        args["statement_cache_size"] = 0

    return args


def _is_supabase_tx_pooler(url: str) -> bool:
    return ("pooler.supabase.com" in url and ":6543" in url) or (
        "supabase.co" in url and ":6543" in url
    )


def _dialect_kwargs() -> dict:
    """Engine-level kwargs that are NOT part of asyncpg's connect signature.

    ``prepared_statement_cache_size`` is a SQLAlchemy asyncpg-dialect
    parameter; setting it to 0 alongside the asyncpg-level statement cache
    fully disables prepared-statement reuse for pgbouncer transaction mode.
    """
    kwargs: dict = {}
    if _is_supabase_tx_pooler(settings.database_url.lower()):
        kwargs["prepared_statement_cache_size"] = 0
    return kwargs


engine = create_async_engine(
    settings.database_url,
    poolclass=NullPool,
    future=True,
    connect_args=_connect_args(),
    **_dialect_kwargs(),
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
