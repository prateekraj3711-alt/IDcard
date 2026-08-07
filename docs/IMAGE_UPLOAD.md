# Image Upload Strategy

## Objective

Move photo bytes from device to durable object storage without passing them through the API server, while enforcing size, hash, and virus-scan gates before the photo becomes visible.

## Pipeline

```
CameraX capture (max 4:3, 4032x3024)
    │
    ▼
On-device processing
    ├─ Rotate by EXIF
    ├─ Face detection (MLKit) — offer auto-crop suggestion
    ├─ Crop to 3:4 portrait (passport)
    ├─ Resize to 720x960 (2x the printed ID card resolution)
    ├─ Encode JPEG quality 85, target ≤ 300 KB
    ├─ Compute SHA-256
    └─ Store at internal storage → /photos/{clientUuid}.jpg
    │
    ▼
Request presigned URL
    │  POST /students/{id}/photo/upload-url
    │  body: { sha256, size_bytes, content_type }
    ▼
Server issues presigned PUT
    │  URL scoped to storage_key = schools/{s}/students/{st}/{uuid}.jpg
    │  X-Amz-Content-Sha256 = sha256   (server binds to a specific body)
    │  Content-Type = image/jpeg
    │  SSE-AES256
    │  expires_in = 300 s
    ▼
Android PUTs bytes with OkHttp
    │  If 200 → continue
    │  If ClientTimeout / IO → retry with fresh presigned URL
    ▼
POST /students/{id}/photo/complete
    │  { storage_key, sha256, size_bytes, width, height }
    ▼
Server
    ├─ HEAD s3 object; assert size + ETag/hash match
    ├─ Enqueue virus scan (Celery task)
    ├─ INSERT photos row (is_primary = true, unset previous)
    └─ Return signed CDN URL
```

## Why Presigned URLs, Not Multipart Through API

- **Cost**: bytes bypass the app tier entirely.
- **Scalability**: photo uploads don't compete with request-serving threads.
- **Reliability**: retries against S3 are cheap and durable.

## Content Addressing

- `storage_key = schools/{school_id}/students/{student_id}/{sha256}.jpg`.
- Duplicate captures produce the same key → S3 overwrites the same object → idempotent.
- One photo per student is marked `is_primary` via partial unique index; older primaries move to history for audit.

## Compression Details (Android)

```kotlin
suspend fun compressForUpload(source: File): Result {
    val bmp = BitmapFactory.decodeFile(source.path).rotatedByExif(source)
    val cropped = bmp.centerCropToRatio(3f, 4f)
    val scaled  = Bitmap.createScaledBitmap(cropped, 720, 960, true)
    val out = File(cacheDir, "photo-${UUID.randomUUID()}.jpg")
    FileOutputStream(out).use { fos ->
        scaled.compress(Bitmap.CompressFormat.JPEG, 85, fos)
    }
    val sha = out.sha256Hex()
    return Result(out, sha, scaled.width, scaled.height)
}
```

Adaptive quality: if the compressed file exceeds 400 KB, re-encode at quality 75. If still >400 KB, downscale to 600x800.

## Server-Side Verification

1. `HEAD` the object; abort if missing or size mismatch.
2. Fetch content and re-hash (bounded worker; skip if size < 500 KB and S3 SSE ETag matches).
3. Run `clamdscan` via socket; on infected → `DELETE` object, insert `audit_logs` entry, return 422 to caller.
4. Update `photos` row with verified metadata.

## CDN + Signed URLs for Read

- Public objects are served via a signed CloudFront/R2 URL with a 10-minute TTL.
- Server caches the signature in Redis (`photo:{id}` for 8 minutes).
- Dashboard requests `GET /students/{id}/photo` which refreshes the URL.

## Failure Handling

| Failure | Action |
|---|---|
| Presign expired | Client re-requests |
| PUT 4xx | Log, mark FAILED, surface to teacher |
| PUT 5xx / IO | Retry with backoff (WorkManager) |
| Verify hash mismatch | Delete object, mark FAILED, alert |
| Virus detected | Delete object, block user? (config), audit |
| Complete after object missing | 409 Conflict; client re-uploads |

## Retention

- Original device copy: kept in app-internal storage until UPLOADED, then optionally deleted (setting).
- Server: photos retained for the life of the student record + 7 years (education record retention). Object versioning enabled on the bucket for accidental delete recovery.

## Bandwidth Budget

- Passport photo target: 200–300 KB.
- Batch of 40 students → ~10 MB → ~15 s on 4G, ~5 s on Wi-Fi.
- The worker uploads photos serially per student, parallelised across students (max 3 concurrent) via a coroutine `Semaphore`.
