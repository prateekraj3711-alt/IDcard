from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# NOTE on Neon compatibility:
# - pool_pre_ping=True triggers a sync ping() on checkout, which calls
#   await_only(_async_ping()) internally. That's fine when we're already
#   inside a greenlet_spawn (i.e. AsyncSession operations), but a stale
#   connection surfaces MissingGreenlet from certain code paths (long
#   sync work inside the async request — e.g. the photo-ZIP upload).
# - Neon closes idle connections after ~5 minutes. Instead of pinging,
#   we recycle every 3 minutes so we never keep one long enough to go
#   stale.
engine = create_async_engine(
    settings.database_url,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    pool_pre_ping=False,
    pool_recycle=180,
    pool_timeout=30,
    future=True,
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
