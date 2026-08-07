# Testing Guide — Web + Android

End-to-end walkthrough of getting the platform running on your machine, testing the super-admin web portal, and installing the teacher app on a real Android phone (or emulator) pointed at your local backend.

Estimated time: 30–45 minutes if it's the first time.

---

## 0. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Docker Desktop | 20+ | Runs Postgres + Redis + MinIO |
| Python | 3.12 | Backend runtime |
| Node.js | 20 LTS | Dashboard build |
| Android Studio | Iguana (2023.2.1) or newer | Builds the APK; installs SDK 34 |
| Java / JDK | 17 | Comes with Android Studio |
| `adb` | any recent | Only if installing on a physical phone |

Clone the repo, then:

```bash
cd IDcard
```

---

## 1. Backend

### 1.1 Boot the infrastructure

```bash
cd backend
cp .env.example .env             # good defaults for local dev
docker compose up -d              # Postgres, Redis, MinIO (S3 clone), buckets
docker compose ps                 # confirm 4 containers healthy
```

MinIO console: <http://localhost:9001> — user `minioadmin` / `minioadmin`. Two buckets should exist: `idcard-photos`, `idcard-cards`.

### 1.2 Install Python deps

```bash
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 1.3 Create the schema + a super admin

```bash
python -m scripts.init_db
python -m scripts.create_super_admin \
    --email admin@example.com \
    --full-name "Site Admin" \
    --password 'ChangeMe123!'
```

Output shows the credentials; note them. In production you'd use Alembic migrations instead of `init_db`.

### 1.4 (Optional) Seed demo data

```bash
python -m scripts.seed_demo
```

Prints a teacher username + password you can use on the Android app.

### 1.5 Run the API

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Sanity checks:

```bash
curl http://localhost:8000/healthz              # {"status":"ok"}
open http://localhost:8000/docs                 # Swagger UI
```

Log in from Swagger's *Authorize* button — hit `POST /auth/login` with `email: admin@example.com`, copy the `access_token`, and paste it.

---

## 2. Web Admin Portal

```bash
cd ../dashboard
npm install
npm run dev
```

Open <http://localhost:5173>.

### 2.1 Login

Email `admin@example.com`, password from step 1.3.

### 2.2 Test flows (checklist)

| Flow | Steps | Expected |
|---|---|---|
| Create a school | *Schools* → *New school* → fill code + name → save | Row appears in grid |
| Generate teacher credentials | *Teachers* → pick school → *Add teacher* → leave username/password blank → *Create* | Modal shows generated credentials; copy them |
| Bulk import (Excel) | *Bulk Import* → pick school → upload a `.xlsx` with headers matching the sample → map columns → skip photos → commit | `imported` counter matches row count |
| Bulk import (with photos) | Same flow but zip a folder where each JPG stem = an `enrollment_no` in your sheet, upload in step 3 | `photos_matched` > 0 |
| Create a template from scratch | *Templates* → *New template* → drop 3–4 fields (Name, Enrollment, Photo, QR) → save | Card appears in template list; opening it restores the layout |
| Import a template image | *Templates* → *Import* → choose a PNG/JPG of an existing card → pick module → import | Editor opens with image locked in background; drop fields on top and save |
| Export & re-import a template | *Templates* → download icon on a card → *Import* → pick the downloaded JSON | New template appears with same layout |
| Regenerate teacher password | *Teachers* → refresh icon on a row | Modal shows new password; teacher's next login must use it |

### 2.3 Watching the network tab

Every write includes `Authorization: Bearer …`. If you see `401`, the axios refresh interceptor tries `POST /auth/refresh` transparently — check DevTools for that call.

---

## 3. Android Teacher App

The app is offline-first. It hits the backend for login + sync, but otherwise runs against Room on-device.

### 3.1 Point the app at your backend

`android/app/build.gradle.kts` has two build types:

```kotlin
debug {
    buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:8000/api/v1/\"")
}
```

- **`10.0.2.2`** is the loopback address the **Android emulator** uses to reach the host machine's `localhost`. It works without changes.
- On a **real phone**, replace it with your dev machine's LAN IP:
  1. Find your Mac/Linux/Windows LAN IP: `ipconfig getifaddr en0` / `ip addr` / `ipconfig`. Example: `192.168.1.42`.
  2. Change the line to `"\"http://192.168.1.42:8000/api/v1/\""`.
  3. Make sure your phone and dev machine are on the same Wi-Fi.
  4. Backend must be launched with `--host 0.0.0.0` (step 1.5 above already does this).

Cleartext HTTP is allowed for `10.0.2.2` and any RFC1918 IP thanks to `res/xml/network_security_config.xml`. If you plug in a different IP, add its domain to that file:

```xml
<domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">10.0.2.2</domain>
    <domain includeSubdomains="true">192.168.1.42</domain>
</domain-config>
```

### 3.2 Open in Android Studio

1. Android Studio → *Open* → select the `android/` folder (**not** the repo root).
2. Studio downloads the Gradle wrapper JAR on first sync. If a *gradle-wrapper.jar missing* error appears, run `gradle wrapper --gradle-version 8.9` in the `android/` folder from any machine with Gradle installed, or *File → Sync Project with Gradle Files*.
3. Wait for the initial Gradle sync — accepts SDK licenses if prompted (target SDK 34).
4. Pick a device:
   - **Emulator**: *Device Manager → Create Device → Pixel 6 → API 34*, then start it.
   - **Real phone**: enable Developer Options + USB debugging on the phone, plug in USB, accept the fingerprint prompt.

### 3.3 Build and install

**Debug APK, one-click**: press the green *Run* button in Android Studio. It builds, installs, and launches on the selected device.

**Command line** (with Gradle wrapper generated):
```bash
cd android
./gradlew :app:installDebug          # macOS/Linux
gradlew.bat :app:installDebug        # Windows
```

**Standalone APK to share**:
```bash
./gradlew :app:assembleDebug
# APK at android/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 3.4 Log in as a teacher

Use the credentials from `python -m scripts.seed_demo` (or from a teacher you created in the dashboard):

- School code: `DPS-DEL-01`
- Username: `priya.sharma`
- Password: printed by the seed script

### 3.5 Test flows (checklist)

| Flow | Steps | Expected |
|---|---|---|
| Login online | Enter credentials, tap *Sign in* | Lands on Students list |
| Add student offline | Turn Wi-Fi off → *+* FAB → fill form → *Submit* | Row appears with `Pending` chip; no error |
| Auto-sync when back online | Turn Wi-Fi back on → wait 5–30 s | Chip changes to `Uploaded`; row visible in web dashboard |
| Capture photo | Open a student → *Capture photo* → shoot → confirm | Row updates with photo path; next sync PUTs to S3/MinIO |
| Sync status | Tap the sync icon in the app bar | See all pending / uploaded / failed rows |
| Failed row recovery | Manually break the network mid-upload → wait for retry backoff | Row eventually resolves; no duplicates in dashboard |

Check the web dashboard while the app syncs — new rows appear on refresh of *Students*.

---

## 4. Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| Dashboard shows a network error on login | Backend not on `:8000` or CORS mismatch | `curl localhost:8000/healthz`; confirm `CORS_ORIGINS` in `.env` includes `http://localhost:5173` |
| `psycopg2` build error in `pip install` | wrong driver | Requirements use `asyncpg`, not `psycopg2`. Ensure the venv is active and re-run |
| `init_db` says relation exists | Old DB from a previous run | `docker compose down -v && docker compose up -d` to reset volumes |
| MinIO `SignatureDoesNotMatch` on photo upload | Clock skew or missing header | Ensure the app is using the presigned URL exactly, including all required headers |
| Android "unable to reach host" | Wrong `API_BASE_URL` for phone | Use LAN IP, same Wi-Fi, `--host 0.0.0.0` on uvicorn |
| APK builds but crashes on launch | Missing Google Play services / MLKit fallback | Emulator: use a *Google APIs* system image. Real device: fine |
| 401 on every request from Android | Access token expired, refresh loop | Check `TokenAuthenticator` logs; refresh token may be stale — log out and back in |

---

## 5. Reset / Tear-down

```bash
# Backend containers + volumes
cd backend
docker compose down -v

# Dashboard
rm -rf dashboard/node_modules

# Android
cd android && ./gradlew clean
```

Delete the DB volume with `docker compose down -v` if you want a clean slate for `init_db` + `seed_demo`.

---

## 6. Where to Go Next

- Point the dashboard at a staging backend by changing the `proxy` config in `dashboard/vite.config.ts`.
- Wire the Celery worker (see [`docs/TEMPLATE_EDITOR.md`](TEMPLATE_EDITOR.md)) to actually render PDFs — the scaffold enqueues jobs but leaves the render as a documented worker task.
- Real Alembic migrations: `cd backend && alembic revision --autogenerate -m "add bulk import + templates"` once models stabilize, then `alembic upgrade head`.
