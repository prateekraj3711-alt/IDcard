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

    redis_url: str = "redis://localhost:6379/0"

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


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
