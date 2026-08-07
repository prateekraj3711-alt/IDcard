# Supabase Postgres — Neon replacement

Supabase is real Postgres (not just wire-compatible), so every extension
we already use (`citext`, `pg_trgm`) works out of the box, along with
`ILIKE`, `JSONB`, `ON CONFLICT`, etc. If we want free auth, storage,
realtime, or edge functions later, they're one env var away. Free tier is
500 MB of DB storage — plenty for the metadata we keep here (photos live
in R2, not the DB).

This doc is the 5-minute swap from Neon.

---

## Why swap

| | Neon Free | Supabase Free |
|---|---|---|
| Storage | 0.5 GB | 0.5 GB |
| Idle behaviour | Auto-suspends compute after ~5 min | Pauses project after 7 days idle |
| Cold start | 1–3 s | 0 (once active), one-click resume from pause |
| Extensions | Most Postgres extensions | Every stock Postgres extension |
| Wire protocol | Postgres | Postgres |
| Card required | No | No |
| Region choice | Yes | Yes |
| Reliability | Occasional `MissingGreenlet` under load | Stable |

Compared with CockroachDB Serverless: Supabase gives you real Postgres
(so no CITEXT/INET portability shim needed — the shim we already have is
still fine, it just becomes a no-op equivalent to VARCHAR) but 20 × less
storage. For this app, storage size is a non-issue because photos live
in R2.

---

## 1. Create the project (3 min)

1. Sign in at <https://supabase.com> (GitHub SSO works).
2. **New Project** → pick a region close to Render → choose a **database
   password** (write it down — you can't recover it, only reset it) →
   **Create**.
3. Wait ~1 min for the project to provision.

---

## 2. Copy the connection string (30 s)

Supabase exposes two connection paths — the choice matters.

**Project → Settings → Database → Connection string.** You'll see tabs:

| Tab | What it is | Port | Use it? |
|---|---|---|---|
| **Direct connection** | One backend per client | 5432 | ✅ Fine for a single-worker Render service |
| **Session mode pooler** | pgbouncer, session mode | 5432 | ✅ **Recommended** — same behaviour as Direct, but survives Supabase maintenance |
| **Transaction mode pooler** | pgbouncer, txn mode | 6543 | ⚠️ Works, but prepared statements have to be disabled |

Prefer **Session mode**. Copy the URI. It looks like:

```
postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres
```

That's your `DATABASE_URL`. Paste it into Render as-is — the app rewrites
the scheme to `postgresql+asyncpg://` and strips `sslmode=` for you.

The app also auto-detects the **transaction pooler** (`:6543` on a
`pooler.supabase.com` host) and disables prepared-statement caching in
that case, so pasting the wrong URL just works — you'll take a small
per-query latency hit but nothing breaks.

---

## 3. Deploy on Render

Same as [CLOUD_DEPLOY.md](./CLOUD_DEPLOY.md) — the only change is the
`DATABASE_URL` value. R2, JWT secret, admin bootstrap all unchanged.

On first boot, `scripts/bootstrap.py`:
1. Creates the `pg_trgm` and `citext` extensions (both succeed on
   Supabase — real Postgres).
2. Runs `Base.metadata.create_all()`.
3. Creates the initial super admin from `INITIAL_ADMIN_EMAIL` /
   `INITIAL_ADMIN_PASSWORD`.

---

## 4. Migrating data from Neon (optional)

If you have live data on Neon:

```bash
# Dump Neon data (no schema — we already have the schema on Supabase).
pg_dump --data-only --no-owner --no-privileges \
  "postgresql://neondb_owner:...@ep-XXX.neon.tech/neondb?sslmode=require" \
  > neon_data.sql

# Load into Supabase.
psql \
  "postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres" \
  < neon_data.sql
```

For a fresh install, skip this — the bootstrap creates an empty schema.

---

## 5. Sanity check

Once Render redeploys:

```
GET https://<your-api>.onrender.com/api/v1/health
```

Log in with the bootstrap admin, create a school, create a teacher — if
those work the swap is done.

---

## Known gotchas

- **IPv6-only free tier**: Supabase's free tier now defaults to IPv6-only
  connections. Render's outbound network supports IPv6, so you're fine.
  If you ever run the API on a network that's IPv4-only (some CI
  runners), enable Supabase's IPv4 add-on (paid) or use the connection
  pooler URL, which is dual-stack.
- **Project auto-pause after 7 days of zero traffic** on the free tier.
  Any request wakes it back up in ~2 s, but scheduled cron would need a
  keep-warm ping if you go weeks without users.
- **The transaction pooler and prepared statements**: covered in
  `_connect_args()` — the code disables the cache automatically when it
  detects `:6543` in the URL. If you see "prepared statement does not
  exist" errors, verify Render's `DATABASE_URL` and confirm the port
  detection is doing its job.

---

## Rollback

Point `DATABASE_URL` back to the Neon URL and redeploy. The `LowerText`
type decorator behaves identically on both. No code change needed.
