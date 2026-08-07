# CockroachDB Serverless — Postgres replacement

Neon works, but its free tier autosuspends on idle and drops connections in
ways that force us to run with `NullPool` and retry logic. CockroachDB
Serverless is a solid alternative: **10 GB free forever, no autosuspend,
PostgreSQL wire-compatible, distributed by default**. This document is the
5-minute swap.

---

## Why swap

| | Neon Free | CockroachDB Serverless |
|---|---|---|
| Storage | 0.5 GB | 10 GB |
| Idle behaviour | Auto-suspends compute after ~5 min | Never sleeps |
| Cold start | 1–3 s | 0 |
| Wire protocol | Postgres | Postgres |
| Card required | No | No |
| Region choice | Yes | Yes (single region on free tier) |
| Reliability | We hit `MissingGreenlet` weekly | Rock solid |

Only real downside: not 100 % Postgres. The app already avoids the two
things that would trip it up (`CITEXT` and `INET` are replaced by portable
type decorators in `models.py`), so this is a drop-in swap for our use.

---

## 1. Create the cluster (3 min)

1. Sign in at <https://cockroachlabs.cloud> (GitHub SSO works).
2. **Create Cluster** → **Serverless** → default region → **Create**.
3. Wait ~30 s for it to provision.
4. **SQL Users** → **Create** → username `idcard`. Copy the generated password.
5. **Databases** → **Create** → name `idcard`. This is the database name.
6. **Connect** → **General connection string** → toggle **Postgres URL** →
   copy. It looks like:

   ```
   postgresql://idcard:<PASSWORD>@<CLUSTER>.<REGION>.aws.cockroachlabs.cloud:26257/idcard?sslmode=verify-full
   ```

That's your `DATABASE_URL`. Paste it into Render as-is — the app rewrites
`sslmode=` and (if present) `options=--cluster=` automatically inside
`app/core/config.py:_normalize_database_url`.

You do NOT need to download a CA certificate. The app forces
`ssl="require"` for `.cockroachlabs.cloud` hosts, which validates against
the system CA bundle already present in the Render Python image.

---

## 2. Verify the URL locally (optional)

```bash
python - <<'PY'
import os
os.environ["DATABASE_URL"] = "<paste your cockroach URL here>"
os.environ.setdefault("JWT_SECRET", "x")
os.environ.setdefault("S3_BUCKET_PHOTOS", "p")
os.environ.setdefault("S3_BUCKET_IDCARDS", "c")
os.environ.setdefault("S3_ACCESS_KEY", "k")
os.environ.setdefault("S3_SECRET_KEY", "s")
from app.core.config import settings
print(settings.database_url)
PY
```

Expected output — scheme rewritten, sslmode dropped:

```
postgresql+asyncpg://idcard:<PASSWORD>@<HOST>:26257/idcard
```

---

## 3. Deploy on Render

Same steps as [CLOUD_DEPLOY.md](./CLOUD_DEPLOY.md) — replace the Neon URL
with the Cockroach one under **Environment → DATABASE_URL**. Everything
else (R2, JWT secret, admin bootstrap) is unchanged.

On first boot, `scripts/bootstrap.py` runs:
1. Tries `CREATE EXTENSION pg_trgm` and `citext` — both fail on Cockroach,
   the errors are logged and ignored (`[bootstrap] skip extension …`).
2. Runs `Base.metadata.create_all()` which emits portable DDL:
   `LowerText` and `IpAddress` render as plain `VARCHAR` on Cockroach.
3. Creates the initial super admin from `INITIAL_ADMIN_EMAIL` /
   `INITIAL_ADMIN_PASSWORD` if set.

If the tables already exist from a previous Neon run, drop them first —
schema shape is identical, but if you're migrating data you'll want to
export from Neon (`pg_dump --data-only`) and import via
`cockroach sql --url … < dump.sql`.

---

## 4. Sanity check

Once Render redeploys, hit the health endpoint:

```
GET https://<your-api>.onrender.com/api/v1/health
```

Log in with the bootstrap admin. Create a school. Create a teacher. If
those work, the swap is complete.

---

## Known differences vs. Postgres

None of these affect the app today, but if you extend the schema:

- **No CITEXT** — use `LowerText` from `models.py` (already in use for
  `email`, `username`).
- **No INET** — use `IpAddress()` (already in use for refresh-token IPs).
- **No pg_trgm** — fuzzy search must fall back to `ILIKE '%…%'` (which we
  already do) or Cockroach's built-in `similarity()` function.
- **No `SELECT … FOR UPDATE SKIP LOCKED`** — Cockroach uses `SELECT …
  FOR UPDATE` with different lock semantics. We don't use this pattern
  anywhere; if you add job queues, use Redis instead.
- **Sequences via `CREATE SEQUENCE`** — supported, but Cockroach recommends
  `unique_rowid()` or `uuid_generate_v4()` for high-concurrency inserts.
  Our tables use client-generated UUIDs, so no change needed.
- **Some `ALTER TYPE`** operations require
  `SET enable_experimental_alter_column_type_general = true`. Rarely
  needed — only if you widen an existing enum in-place.

---

## Rollback

Point `DATABASE_URL` back to the Neon URL and redeploy. The app rewrites
both flavours identically, so no code change is required.
