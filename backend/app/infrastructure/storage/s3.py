from functools import lru_cache

import boto3
from botocore.client import Config

from app.core.config import settings


@lru_cache
def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path" if settings.s3_use_path_style else "auto"},
            # Cloudflare R2 rejects requests that include an SSE header, and it
            # doesn't understand streaming-signed payloads either. Force normal
            # SigV4 with a payload sha256 instead of STREAMING-AWS4-HMAC-SHA256.
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def _is_r2() -> bool:
    return bool(settings.s3_endpoint_url and "r2.cloudflarestorage.com" in settings.s3_endpoint_url)


def presign_put(bucket: str, key: str, content_type: str = "image/jpeg", sha256_b64: str | None = None) -> dict:
    """Presigned PUT URL for direct-from-client uploads. Adjusts params for
    Cloudflare R2 (no SSE, no checksum-in-signature)."""
    params: dict = {"Bucket": bucket, "Key": key, "ContentType": content_type}
    required_headers = {"Content-Type": content_type}
    if not _is_r2():
        params["ServerSideEncryption"] = "AES256"
        required_headers["x-amz-server-side-encryption"] = "AES256"
    if sha256_b64 and not _is_r2():
        params["ChecksumSHA256"] = sha256_b64

    url = get_s3_client().generate_presigned_url(
        "put_object", Params=params, ExpiresIn=settings.presign_ttl_seconds
    )
    return {
        "url": url,
        "storage_key": key,
        "expires_in": settings.presign_ttl_seconds,
        "required_headers": required_headers,
    }


def presign_get(bucket: str, key: str, expires_in: int = 600) -> str:
    return get_s3_client().generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=expires_in
    )


def head(bucket: str, key: str) -> dict | None:
    try:
        return get_s3_client().head_object(Bucket=bucket, Key=key)
    except Exception:
        return None
