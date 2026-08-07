# Offline Synchronization Strategy

## Principles

1. **Room is the source of truth on device.** Every UI screen observes Room via `Flow`. Network never blocks the UI.
2. **Every mutating action produces a `PendingOp` row.** These are drained by a background worker.
3. **Client-generated UUIDs.** Each student has a `client_uuid` (UUID v4). The server upserts by this key, making retries idempotent.
4. **At-least-once delivery, exactly-once effect.** Server dedupes by `client_uuid` + `Idempotency-Key`.
5. **Photos are content-addressed.** SHA-256 of the compressed JPEG is computed on device; used for the storage key and dedup.

## Local Data Model (Room)

```kotlin
@Entity(tableName = "students")
data class StudentEntity(
    @PrimaryKey val clientUuid: String,        // UUID v4 generated on device
    val serverId: String? = null,              // filled after first successful sync
    val schoolId: String,
    val classId: String?,
    val sectionId: String?,
    val enrollmentNo: String,
    val name: String,
    // … all other fields …
    val syncStatus: SyncStatus,                // PENDING / UPLOADING / UPLOADED / FAILED
    val lastSyncError: String? = null,
    val updatedAt: Long                         // millis; last local edit
)

@Entity(tableName = "pending_ops")
data class PendingOpEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val entityType: String,      // "student" | "photo"
    val entityUuid: String,      // student.clientUuid
    val op: String,              // "create" | "update" | "delete" | "photo_upload"
    val payloadJson: String,     // serialized DTO
    val idempotencyKey: String,  // UUID
    val attempts: Int = 0,
    val nextAttemptAt: Long = 0,
    val lastError: String? = null,
    val createdAt: Long
)

@Entity(tableName = "pending_photos")
data class PendingPhotoEntity(
    @PrimaryKey val id: String,           // UUID
    val studentClientUuid: String,
    val localPath: String,                // internal storage
    val sha256: String,
    val sizeBytes: Long,
    val width: Int,
    val height: Int,
    val syncStatus: SyncStatus,
    val storageKey: String? = null,       // filled after upload-url is issued
    val attempts: Int = 0
)
```

## Flow

```
User taps "Save"
      │
      ▼
Repository.saveStudent(student)
      │
      ├── UPSERT into `students` (syncStatus = PENDING)
      ├── INSERT PendingOp(op = create/update, payload)
      └── WorkManager.enqueueUniqueWork("sync", KEEP, SyncStudentsWorker)

WorkManager (constraints: NetworkType.CONNECTED, backoff exponential 30 s → 4 h)
      │
      ▼
SyncStudentsWorker.doWork()
      │
      ├─ For each pending op in FIFO order:
      │     ├─ mark syncStatus = UPLOADING
      │     ├─ POST /sync/batch  (or /students, /students/{id})
      │     ├─ on 2xx:
      │     │     - store server_id on the student row
      │     │     - mark syncStatus = UPLOADED
      │     │     - delete PendingOp
      │     ├─ on 4xx (except 409):
      │     │     - mark syncStatus = FAILED, record error, DO NOT retry
      │     │     - surface to UI so the teacher can fix + retry manually
      │     ├─ on 409 (duplicate):
      │     │     - treat as UPLOADED, delete PendingOp
      │     └─ on 5xx / IO:
      │           - attempts += 1
      │           - return Result.retry() (WorkManager backs off)
      │
      └─ Then drain PendingPhotoEntity in the same worker (or a chained one)
```

## Photo Upload Flow

```
Camera capture → local JPEG (compressed, cropped)
      │
      ├─ Compute SHA-256, width, height
      ├─ INSERT PendingPhoto
      └─ WorkManager.enqueue UploadPhotoWorker

UploadPhotoWorker
      │
      ├─ Wait until parent student has serverId
      ├─ POST /students/{id}/photo/upload-url  → { url, storage_key }
      ├─ PUT bytes to `url`  (OkHttp, resumable via Content-Range not needed for < 10 MB)
      ├─ POST /students/{id}/photo/complete   → server verifies hash, marks primary
      └─ delete local file (optional, or keep in cache)
```

## Conflict Resolution

- **Last-writer-wins with monotonic `updatedAt`** on device; the server compares its own `updated_at` and rejects with `409` if newer. The mobile app then pulls the server copy and marks local `SyncStatus = FAILED (server_newer)`, letting the teacher choose.
- **Delete beats update** — a pending delete for a UUID cancels any queued updates for the same UUID.

## Batching

- The worker batches up to 50 ops into a single `POST /sync/batch` when >1 pending op is present. Photos are always PUT individually (they don't fit a JSON batch).

## Connectivity Detection

- Use `ConnectivityManager.NetworkCallback` to nudge WorkManager (`enqueueUniquePeriodicWork` fallback every 15 min for resilience).
- Distinguish "metered" vs "unmetered": if a user preference is set to "Wi-Fi only for photos", the photo worker gates on `NetworkType.UNMETERED`.

## UI Surfacing

- Student list row shows a chip: `Pending`, `Uploading`, `Uploaded`, `Failed`.
- A "Sync" screen shows all pending ops with retry / discard actions.
- Retry: reset `attempts`, `syncStatus = PENDING`, enqueue worker.
- Discard: delete pending op and revert local row.

## Server-Side Deduplication

- `client_uuid` has a `UNIQUE` constraint on `students`.
- The service layer uses `INSERT … ON CONFLICT (client_uuid) DO UPDATE SET …` (Postgres upsert).
- Photos: presigned URLs are single-use (short TTL). Same `sha256` for the same student → idempotent replace.
