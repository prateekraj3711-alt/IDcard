from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.middleware import RequestIdMiddleware, SecurityHeadersMiddleware
from app.api.rate_limit import RateLimiter
from app.api.routers import (
    auth,
    bulk_imports,
    health,
    id_card_jobs,
    id_cards,
    photos,
    schools,
    students,
    sync,
    teachers,
    templates,
)
from app.core.config import settings
from app.core.logging import configure_logging

configure_logging()

app = FastAPI(
    title="Student ID Card API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)
app.add_middleware(RateLimiter, redis_url=settings.redis_url)


@app.exception_handler(StarletteHTTPException)
async def http_exc_handler(request: Request, exc: StarletteHTTPException):
    body = exc.detail if isinstance(exc.detail, dict) else {"detail": exc.detail}
    body.setdefault("title", exc.__class__.__name__)
    body["status"] = exc.status_code
    body["instance"] = str(request.url.path)
    body["type"] = f"https://api.idcard.example.com/errors/{exc.status_code}"
    return JSONResponse(body, status_code=exc.status_code)


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    return JSONResponse(
        {
            "type": "https://api.idcard.example.com/errors/500",
            "title": "Internal Server Error",
            "status": 500,
            "detail": "unexpected error",
            "instance": str(request.url.path),
        },
        status_code=500,
    )


API_V1 = "/api/v1"
for r in (
    auth.router,
    schools.router,
    teachers.router,
    students.router,
    photos.router,
    sync.router,
    id_cards.router,
    bulk_imports.router,
    templates.router,
    id_card_jobs.router,
):
    app.include_router(r, prefix=API_V1)

app.include_router(health.router)
