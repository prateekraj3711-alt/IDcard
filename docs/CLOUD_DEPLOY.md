# Cloud Deploy — Go Live in 30 Minutes

Zero local infra. You click through a few consoles once, and every future push auto-deploys.

## Pick a storage tier

Photos average ~300 KB after compression. Rough capacity per free tier:

| Storage | Free | Card needed? | Egress | Capacity ≈ photos | Recommended for |
|---|---|---|---|---|---|
| **Cloudflare R2** | **10 GB** | Card on file (verification only, no charge) | **Free, unlimited** | ~33 000 photos | **Any real deployment** |
| Storj DCS | 25 GB | No | 25 GB/mo | ~85 000 photos | No-card, largest free tier — decentralized, slightly higher latency |
| Backblaze B2 | 10 GB | Card on file | 1 GB/day | ~33 000 photos | Similar to R2 |
| Supabase Storage | 1 GB | No | 2 GB/mo | ~3 300 photos | Proof of concept only |

Cloudflare R2 is unbeatable at scale: the free tier holds a mid-sized school district (10 GB = ~33 000 photos), and past that it's **$0.015 / GB / month with free egress** — 100 GB of photos costs $1.50/mo. Card is only for anti-abuse; nothing charges unless you exceed the free tier.

If you can't or won't put a card on file anywhere, **Storj** is the largest no-card option (25 GB, S3-compatible). Setup is nearly identical.

---

## Full stack

Same code, three paths depending on tolerance for cards:

| Piece | Recommended (R2) | Card-free (Storj) | Notes |
|---|---|---|---|
| Backend | Render (free web service) | Render (free web service) | Both card-free; API sleeps after 15 min idle |
| Postgres | **Neon** 0.5 GB, no card | Neon 0.5 GB, no card | Enough for ~200 k students + audit log |
| Storage | **Cloudflare R2** 10 GB, card | Storj DCS 25 GB, no card | Both S3-compatible — swap env vars only |
| Redis | Upstash 10 k cmds/day (optional) | Upstash (optional) | Rate limiter fails open without it |
| Dashboard | Vercel | Vercel | No card |
| APK build | GitHub Actions | GitHub Actions | Free on public repos |

Every service signs up with an email or GitHub login. Below assumes the recommended R2 path — the Storj path only differs in section 3.

---

## 1. Neon — Postgres (3 min, no card)

1. <https://neon.tech> → sign in with GitHub.
2. **Create Project** → closest region → default settings.
3. Copy the **Pooled connection string** for the `main` branch:
   `postgres://neondb_owner:...@ep-XXX-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require`
4. **Rewrite it** for our async driver:
   - Prefix: `postgres://` → `postgresql+asyncpg://`
   - Strip the query string (`?sslmode=require`) — asyncpg negotiates TLS itself.

Final shape:
```
postgresql+asyncpg://neondb_owner:...@ep-XXX-pooler.us-east-1.aws.neon.tech/neondb
```

Save it — it's `DATABASE_URL` later.

---

## 2. Upstash — Redis (optional, 2 min, no card)

1. <https://upstash.com> → sign in with GitHub → **Create database** → Regional → free plan.
2. Copy the **Redis URL** (must start with `rediss://` — the TLS variant).

Skip entirely if you don't want it. The rate limiter middleware fails open when `REDIS_URL` is empty.

---

## 3. Storage — pick R2 (recommended) OR Storj (no card)

### 3-R2: Cloudflare R2 — 10 GB free, egress free (5 min)

1. Sign into Cloudflare → **R2** → **Create bucket**. Create **two** buckets: `idcard-photos`, `idcard-cards`. Any region.
2. Cloudflare will prompt you for a payment method the first time you use R2. It's for identity verification — you are not charged unless you exceed the free tier, and even then only for the overage.
3. **R2 → Manage R2 API tokens → Create API token** → *Object Read & Write* on **both** buckets. Copy:
   - **Access Key ID**
   - **Secret Access Key**
4. **R2 overview → S3 API** → copy the endpoint. Shape:
   `https://<account-hash>.r2.cloudflarestorage.com`

You now have six env vars to paste in Render:

| Variable | Value |
|---|---|
| `S3_ENDPOINT_URL` | R2 endpoint from step 4 |
| `S3_REGION` | `auto` |
| `S3_BUCKET_PHOTOS` | `idcard-photos` |
| `S3_BUCKET_IDCARDS` | `idcard-cards` |
| `S3_ACCESS_KEY` | R2 Access Key ID |
| `S3_SECRET_KEY` | R2 Secret Access Key |

### 3-Storj: Storj DCS — 25 GB free, no card (5 min)

1. <https://storj.io> → **Get Started Free** → sign up (email verify).
2. **Create Project** → default settings.
3. **Buckets → New Bucket**: create `idcard-photos` and `idcard-cards`.
4. **Access → S3-compatible credentials → Create S3 Credentials** → scope to both buckets → download / copy:
   - **Access Key** and **Secret Key**
   - **Endpoint**: `https://gateway.storjshare.io`

Env vars for Render:

| Variable | Value |
|---|---|
| `S3_ENDPOINT_URL` | `https://gateway.storjshare.io` |
| `S3_REGION` | `us-east-1` |
| `S3_BUCKET_PHOTOS` | `idcard-photos` |
| `S3_BUCKET_IDCARDS` | `idcard-cards` |
| `S3_ACCESS_KEY` | Storj Access Key |
| `S3_SECRET_KEY` | Storj Secret Key |

---

## 4. Render — deploy the API (10 min, no card for the web service)

1. <https://render.com> → sign in with GitHub → **New → Blueprint** → pick your fork on the branch you want.
2. Render reads `render.yaml`. Only the **web service** provisions automatically — the DB and Redis blocks are commented out because we're using Neon + Upstash.
3. Render prompts for the `sync: false` env vars. Paste them:
   - `DATABASE_URL` — Neon URL from section 1
   - `REDIS_URL` — Upstash URL (section 2), or leave blank
   - All six `S3_*` vars from section 3 (either R2 or Storj)
   - `CORS_ORIGINS` — leave blank for now
4. Deploy. First build takes 4–6 min. When green, copy the service URL — e.g. `https://idcard-api.onrender.com`.
5. Open the service's **Shell** and bootstrap:
   ```bash
   python -m scripts.init_db
   python -m scripts.create_super_admin --email admin@example.com --full-name "Site Admin" --password 'ChangeMe123!'
   python -m scripts.seed_demo    # optional
   ```
6. Sanity check: `https://<your-url>/healthz` → `{"status":"ok"}`. Swagger at `/docs`.

> Render's free web service sleeps after 15 min of no traffic. First request after wakes it in ~30 s. To keep it warm, add a free uptime monitor (e.g. <https://uptimerobot.com>) hitting `/healthz` every 5 min.

---

## 5. Vercel — dashboard (5 min, no card)

1. <https://vercel.com> → sign in with GitHub → **Add New → Project** → import your fork.
2. Configure:
   - **Root Directory**: `dashboard`
   - Framework Preset: **Vite** (auto-detected)
3. **Environment Variables**:
   - `VITE_API_BASE_URL` = your Render URL + `/api/v1` (e.g. `https://idcard-api.onrender.com/api/v1`)
4. Deploy. ~2 min. Copy the Vercel URL.
5. Back in **Render → API service → Environment**, set `CORS_ORIGINS` = your Vercel URL. Save (auto-redeploys).
6. Log into the dashboard with the super-admin credentials from step 4.5.

---

## 6. Android APK — GitHub Actions (5 min, no card)

1. GitHub → your fork → **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `API_BASE_URL`
   - Value: your Render URL + `/api/v1/` (trailing slash required)
2. Trigger a build:
   - Tag path: `git tag v1.0.0 && git push origin v1.0.0` — APK auto-attached to a GitHub Release.
   - Manual path: **Actions → Android — build & publish APK → Run workflow**.
3. Wait ~6 min. Download the APK from **Releases** (tagged path) or **Actions → the run → Artifacts** (manual path).
4. Send it to your phone (email / Drive / USB / direct download from GitHub on the phone), tap to install (Android asks once to allow unknown-source installs), open **Student ID**, log in with a teacher account.

The APK talks to your Render backend automatically because the URL was baked in at build time. To point at a different environment, re-run the workflow with a different URL and re-install.

---

## Custom domain (optional)

- **Vercel**: Project → Settings → Domains → add `admin.yourdomain.com`.
- **Render**: Web service → Settings → Custom Domains → add `api.yourdomain.com`.

After DNS goes live, update `CORS_ORIGINS` (Render) and `VITE_API_BASE_URL` (Vercel), then re-run the Android workflow with the new API URL.

---

## When free tiers stop being enough

Realistic numbers for ~100 schools, 50 000 students, 1 000 uploads/day:

| Service | Free tier | First upgrade | Cost |
|---|---|---|---|
| Render web | Free (sleeps) | Starter (always-on) | $7/mo |
| Neon Postgres | 0.5 GB | Launch (10 GB + branches) | $19/mo |
| Cloudflare R2 | 10 GB + free egress | Pay-as-you-go | $0.015/GB — 50 GB = **$0.75/mo** |
| Storj | 25 GB + 25 GB egress | Pay-as-you-go | $4/TB — 100 GB = $0.40/mo |
| Upstash Redis | 10 k cmds/day | Pay-as-you-go | ~$1/mo at typical load |
| Vercel Hobby | Free | Pro (only for team features) | $20/mo |
| GitHub Actions | Free on public repos | Included on private up to 2000 min/mo | free below the cap |

Ballpark for a real launch on the recommended stack: **~$30–50/month**.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard shows *CORS error* on login | Render → `CORS_ORIGINS` must contain the exact Vercel URL (scheme, no trailing slash). Redeploy. |
| `/healthz` OK, login returns 401 | Super admin not created. Open the Render shell and run `scripts.create_super_admin`. |
| Photo upload 403 in browser | R2/Storj: verify the token has Read + Write on both buckets. Ensure `S3_USE_PATH_STYLE=true`. |
| Neon 500 with `sslmode` error | Remove `?sslmode=require` from the URL — asyncpg negotiates TLS itself. |
| Neon 500 with driver error | Use `postgresql+asyncpg://...`, not `postgres://...`. |
| Render API keeps waking slowly | Free uptime monitor hitting `/healthz` every 5 min. |
| APK stuck on login | Baked-in URL wrong. Re-run the workflow with the correct `API_BASE_URL` and reinstall. |
| Upstash TLS handshake failure | Use `rediss://` (double s), not `redis://`, from Upstash. |

Local dev instructions (Docker + Uvicorn + Vite) are still in [TESTING_GUIDE.md](TESTING_GUIDE.md) if you need them.
