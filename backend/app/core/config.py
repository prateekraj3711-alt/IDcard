from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"
    app_name: str = "idcard-api"
    log_level: str = "INFO"

    database_url: str
    database_pool_size: int = 10
    database_max_overflow: int = 20

    redis_url: str = ""     # optional — rate limiter falls open when unset

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_ttl_seconds: int = 900
    refresh_token_ttl_seconds: int = 604800
    bcrypt_rounds: int = 12

    s3_endpoint_url: str | None = None
    s3_region: str = "us-east-1"
    s3_bucket_photos: str
    s3_bucket_idcards: str
    s3_access_key: str
    s3_secret_key: str
    s3_use_path_style: bool = False
    presign_ttl_seconds: int = 300

    cors_origins: List[str] = Field(default_factory=list)
    max_photo_bytes: int = 5 * 1024 * 1024

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator(
        "s3_endpoint_url", "s3_region", "s3_bucket_photos", "s3_bucket_idcards",
        "s3_access_key", "s3_secret_key", "redis_url",
        mode="before",
    )
    @classmethod
    def _strip_str(cls, v):
        """Env vars pasted into Render's UI sometimes carry trailing spaces or
        a stray CR — boto3 then rejects the endpoint URL as malformed. Strip
        every S3-related string setting defensively."""
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_database_url(cls, v):
        """Make the URL safe for SQLAlchemy async no matter which form the user
        pasted. Neon, Render, Supabase, and CockroachDB all emit different
        flavours (`postgres://`, `postgresql://`, `cockroachdb://`, with an
        `?sslmode=require` query and — for Cockroach Cloud — an
        `?options=--cluster%3Dfoo` cluster router). Rewrite everything to the
        async form asyncpg understands, and hoist Cockroach-specific query
        params into asyncpg `server_settings` so they survive the switch."""
        if not isinstance(v, str) or not v:
            return v
        v = v.strip()

        # Normalize scheme.
        if v.startswith("cockroachdb://"):
            v = "postgresql+asyncpg://" + v[len("cockroachdb://"):]
        elif v.startswith("cockroachdb+asyncpg://"):
            v = "postgresql+asyncpg://" + v[len("cockroachdb+asyncpg://"):]
        elif v.startswith("postgres://"):
            v = "postgresql+asyncpg://" + v[len("postgres://"):]
        elif v.startswith("postgresql://") and "+" not in v.split("://", 1)[0]:
            v = "postgresql+asyncpg://" + v[len("postgresql://"):]

        # Strip params asyncpg rejects.
        if "?" in v:
            base, _, query = v.partition("?")
            keep: list[str] = []
            for kv in query.split("&"):
                if not kv:
                    continue
                low = kv.lower()
                # asyncpg negotiates TLS from the URL itself, not sslmode.
                if low.startswith("sslmode="):
                    continue
                # `options=--cluster%3Dfoo` is a Cockroach Cloud router — asyncpg
                # accepts it via the DSN as a `server_settings` entry, but the
                # simplest path is to drop it and let libpq-style routing be
                # handled by the connection host prefix Cockroach embeds.
                if low.startswith("options="):
                    continue
                keep.append(kv)
            v = base + (("?" + "&".join(keep)) if keep else "")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
