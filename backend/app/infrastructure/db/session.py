from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

# NullPool opens a fresh asyncpg connection per checkout and closes it on
# return. It removes every stale-connection failure mode we've been chasing:
#   - pool_pre_ping triggering MissingGreenlet on Neon-idled connections
#   - pool_recycle races where a connection was fine on borrow but died mid-tx
#   - Render free-tier processes with only 1 worker anyway
# The extra ~5–15 ms per request against Neon is a fine trade for reliability.
engine = create_async_engine(
    settings.database_url,
    poolclass=NullPool,
    future=True,
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
