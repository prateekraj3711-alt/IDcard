# Android — Teacher App

Kotlin, Jetpack Compose, MVVM, Room, Retrofit, CameraX, WorkManager, Hilt.

## Modules

```
app/src/main/java/com/schoolapp/idcard/
├── IdCardApp.kt               # Application (Hilt, WorkManager config provider)
├── MainActivity.kt            # NavHost
├── data/
│   ├── local/                 # Room DB, DAOs, entities
│   ├── remote/                # Retrofit, DTOs, AuthInterceptor, TokenAuthenticator, TokenStore
│   └── repository/            # AuthRepository, StudentRepository
├── di/AppModule.kt            # Hilt bindings
├── worker/                    # SyncStudentsWorker, UploadPhotoWorker
├── ui/
│   ├── auth/                  # LoginScreen + VM
│   ├── students/              # List, Edit + VMs
│   ├── camera/                # CameraX capture
│   └── sync/                  # Sync status screen
└── util/ImageUtil.kt          # Passport-crop, compression, SHA-256
```

## Offline sync

- Room is source of truth. Every `saveDraft` upserts locally and enqueues a `PendingOp`.
- `SyncStudentsWorker` drains pending ops with idempotency keys; server upserts by `client_uuid`.
- `UploadPhotoWorker` handles presigned S3 PUT + complete.

## Auth

- `TokenStore` — `EncryptedSharedPreferences` (AndroidKeystore).
- `AuthInterceptor` adds `Authorization: Bearer …`.
- `TokenAuthenticator` refreshes on 401 (single-flight via Mutex), retries the original.

## Build

Open in Android Studio Iguana+, sync Gradle, target device API 24+.

Set `API_BASE_URL` in `app/build.gradle.kts` per build type. Debug default targets the loopback emulator address `10.0.2.2:8000`.
