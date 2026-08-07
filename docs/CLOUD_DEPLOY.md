# Cloud Deploy — Go Live in 30 Minutes

Zero local infra. You click through three consoles once, and every future push auto-deploys.

| Piece | Platform | Free tier | What it does |
|---|---|---|---|
| Backend + DB + Redis | Render | Yes (with sleep after idle) | FastAPI + managed Postgres + managed Redis in one Blueprint |
| Object storage | Cloudflare R2 | 10 GB storage + 1 M ops/mo free | Photos, ID card PDFs |
| Dashboard | Vercel | Hobby free | Static React SPA, auto-deploys from GitHub |
| Android APK | GitHub Actions + Releases | Free for public repos | Every tag push builds an APK and attaches it to a Release |

You need three accounts (all free): **Render**, **Vercel**, **Cloudflare**. Sign each into GitHub so they can watch your repo.

---

## 0. Merge the branch (or deploy from it)

The branch you're on is fine for testing. To make `main` the default deploy target:

```bash
git checkout main
git merge claude/student-enrollment-id-cards-5nthet
git push origin main
```

Or just point each service at the branch — instructions call this out where it matters.

---

## 1. Cloudflare R2 — object storage (5 min)

1. Sign into Cloudflare → **R2** in the sidebar → **Create bucket**.
   - Create **two** buckets: `idcard-photos` and `idcard-cards` (any region).
2. R2 sidebar → **Manage API tokens** → **Create API token**.
   - Permission: **Object Read & Write**, both buckets.
   - Copy the **Access Key ID** and **Secret Access Key** — you'll paste them into Render in the next step.
3. Grab the **S3 endpoint** from the R2 overview — it looks like `https://<account-hash>.r2.cloudflarestorage.com`.

Keep this tab open — you need four values in a moment:

- `S3_ENDPOINT_URL` = the R2 S3 endpoint
- `S3_BUCKET_PHOTOS` = `idcard-photos`
- `S3_BUCKET_IDCARDS` = `idcard-cards`
- `S3_ACCESS_KEY`, `S3_SECRET_KEY` = the R2 API token pair

---

## 2. Render — backend + Postgres + Redis (10 min)

1. Sign into <https://render.com> → **New +** → **Blueprint**.
2. Connect the repo `prateekraj3711-alt/idcard` (authorize the GitHub app if needed) → pick the branch (`main` or `claude/student-enrollment-id-cards-5nthet`).
3. Render reads `render.yaml`, previews **1 web service + 1 Postgres + 1 Redis**. Click **Apply**.
4. Render prompts for the `sync: false` env vars. Paste:
   - `S3_ENDPOINT_URL` — from R2
   - `S3_BUCKET_PHOTOS` — `idcard-photos`
   - `S3_BUCKET_IDCARDS` — `idcard-cards`
   - `S3_ACCESS_KEY`, `S3_SECRET_KEY` — from R2 API token
   - `CORS_ORIGINS` — leave blank for now; you'll set it after the Vercel deploy.
5. First deploy takes 4–6 min. When it's green, copy the service URL — e.g. `https://idcard-api.onrender.com`.
6. Open a shell on the service (Render → the API service → **Shell**) and bootstrap the schema + a super admin:
   ```bash
   python -m scripts.init_db
   python -m scripts.create_super_admin --email admin@example.com --full-name "Site Admin" --password 'ChangeMe123!'
   python -m scripts.seed_demo    # optional
   ```
7. Sanity check: `https://idcard-api.onrender.com/healthz` returns `{"status":"ok"}`. The Swagger UI is at `/docs`.

> **Free-tier caveat.** Render puts the API to sleep after 15 minutes of no traffic. First request after sleep takes ~30 s. Upgrade to Starter ($7/mo) to keep it warm.

---

## 3. Vercel — dashboard (5 min)

1. <https://vercel.com> → **Add New… → Project** → import `prateekraj3711-alt/idcard`.
2. Configure:
   - **Root Directory**: `dashboard`
   - **Framework Preset**: Vite (auto-detected)
   - **Build Command / Output Directory**: leave defaults (`npm run build` / `dist`)
3. **Environment Variables** → add:
   - `VITE_API_BASE_URL` = `https://idcard-api.onrender.com/api/v1` (the Render URL from step 2 + `/api/v1`)
4. Click **Deploy**. First build takes ~2 min.
5. Copy the Vercel URL — e.g. `https://idcard-<yourname>.vercel.app`.

Now go back to Render → API service → **Environment** → set:
- `CORS_ORIGINS` = your Vercel URL (comma-separated if you have multiple, e.g. `https://idcard.vercel.app,https://idcard-git-main.vercel.app`).

Render auto-redeploys.

**Log in** to the dashboard at your Vercel URL with the super-admin credentials from step 2.6.

---

## 4. Android APK — build in GitHub Actions (5 min)

1. GitHub → your fork → **Settings → Secrets and variables → Actions → New repository secret**.
   - `API_BASE_URL` = your Render URL + `/api/v1/` (e.g. `https://idcard-api.onrender.com/api/v1/`).
2. Trigger a build. Two options:
   - **Tag a release** — creates a downloadable Release with the APK attached:
     ```bash
     git tag v1.0.0
     git push origin v1.0.0
     ```
   - **Manual run** — GitHub → **Actions → Android — build & publish APK → Run workflow**. Optionally override the URL here.
3. Wait ~6 min. When green:
   - **From a tag**: GitHub → **Releases** → download `idcard-teacher-<sha>.apk`.
   - **From workflow_dispatch / push**: **Actions → Android — build & publish APK → the latest run → Artifacts → idcard-teacher-apk.zip**.

### Install on your phone

1. Copy the APK to the phone (email it, drop it in Drive, USB transfer, or scan the direct link).
2. Tap the APK → Android asks to allow installs from your browser/file manager → *Allow* → *Install*.
3. Open **Student ID**.
4. Log in with a teacher account you created in the dashboard (`Teachers → Add teacher`) — the super admin sees the generated username + password once.

The APK talks to your Render backend automatically because `API_BASE_URL` was baked in at build time. To point at a different environment, run the workflow again with a different URL and re-install.

---

## 5. Custom domain (optional)

Both platforms make this a one-click affair:

- **Vercel**: Project → Settings → Domains → add `admin.yourdomain.com` → follow DNS instructions.
- **Render**: Web service → Settings → Custom Domains → add `api.yourdomain.com` → CNAME to the Render URL.

After a custom domain is live:
- Re-set `CORS_ORIGINS` in Render to the new dashboard domain.
- Re-set `VITE_API_BASE_URL` in Vercel to `https://api.yourdomain.com/api/v1`.
- Trigger a new APK build with the new API URL and re-install.

---

## 6. What each service costs at scale

Assumes ~100 schools, ~50 000 students, ~1 000 uploads / day.

| Service | Free tier limit | Paid escalation |
|---|---|---|
| Render API | Free with sleep | Starter $7/mo (always-on) → Standard $25/mo |
| Render Postgres | Free 90-day trial then paid | $6/mo Starter (256 MB) → $20/mo Standard |
| Render Redis | Free (25 MB) | $10/mo (250 MB) is plenty |
| Cloudflare R2 | 10 GB + 1 M ops/mo free | $0.015/GB storage + $4.50/million Class A ops after |
| Vercel Hobby | Free (100 GB bandwidth) | Pro $20/mo for teams |
| GitHub Actions | 2 000 min/mo free (public: unlimited) | $0.008/min after |

Ballpark, a real production deployment lands under **$50/month** on this stack.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard shows *CORS error* on login | Render → `CORS_ORIGINS` must contain the exact Vercel URL (scheme included, no trailing slash). Redeploy after change. |
| `/healthz` works, login returns 401 | Super admin not created. Open the Render shell and run `python -m scripts.create_super_admin ...`. |
| Photo uploads 403 in browser | R2 bucket permissions or S3 signature version. Verify the API token has *Object Read & Write* on both buckets, and that `S3_USE_PATH_STYLE=true` in Render. |
| APK installs but crashes on launch | Check Actions logs for a Gradle error. Most common cause: `API_BASE_URL` secret missing → the fallback URL points to a domain you don't own. |
| APK opens but stuck on login | Baked-in URL wrong. Re-run the workflow with the correct `API_BASE_URL` and reinstall. |
| Render free API keeps waking slowly | Upgrade to Starter, or hit `/healthz` on a cron (uptime-robot free plan). |

Everything below this file — local testing, running the emulator locally, seeding demo data on your laptop — is still documented in [`TESTING_GUIDE.md`](TESTING_GUIDE.md), but you don't need it once the cloud path is up.
