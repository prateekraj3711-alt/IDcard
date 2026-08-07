from __future__ import annotations

import time

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

try:
    import redis.asyncio as aioredis
except ImportError:  # optional at scaffold time
    aioredis = None  # type: ignore


class RateLimiter(BaseHTTPMiddleware):
    """
    Fixed-window rate limiter in Redis:
      - Per-IP for anonymous routes
      - Per-user (from Authorization header hash) for authenticated
    Fallback: no-op when Redis is unreachable (fail-open with logging).
    """

    def __init__(self, app, redis_url: str, default_limit: int = 300, window_s: int = 60):
        super().__init__(app)
        self.redis_url = redis_url
        self.default_limit = default_limit
        self.window_s = window_s
        self._redis = None

    async def _get_redis(self):
        if aioredis is None or not self.redis_url:
            return None
        if self._redis is None:
            try:
                self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
                await self._redis.ping()
            except Exception:
                self._redis = None
        return self._redis

    async def dispatch(self, request: Request, call_next):
        r = await self._get_redis()
        if r is None:
            return await call_next(request)

        identity = request.headers.get("authorization", request.client.host if request.client else "anon")
        key = f"rl:{int(time.time() // self.window_s)}:{identity[:64]}:{request.url.path}"
        try:
            count = await r.incr(key)
            if count == 1:
                await r.expire(key, self.window_s)
            if count > self.default_limit:
                return JSONResponse(
                    {"title": "Too Many Requests", "status": 429, "detail": "rate limit exceeded"},
                    status_code=429,
                )
        except Exception:
            pass  # fail-open

        return await call_next(request)
