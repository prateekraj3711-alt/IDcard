# Self-hosting Stark ID (100% open source, zero SaaS)

Everything the platform needs — database, object storage, cache,
backend, dashboard, TLS — runs on one Linux box. No Neon, no Supabase,
no Render, no Vercel, no R2. Just Docker Compose.

**Stack**

| Piece | Software | Notes |
|---|---|---|
| Postgres | `postgres:16-alpine` | Vanilla Postgres, official image |
| Object storage | `minio/minio` | S3-compatible; our code already talks S3 |
| Cache / rate-limit | `redis:7-alpine` | Optional; the app fails open without it |
| Backend | This repo's `backend/Dockerfile` | FastAPI + asyncpg + boto3 |
| Dashboard | Vite build served static | Built by a one-shot node container |
| TLS + reverse proxy | `caddy:2-alpine` | Automatic Let's Encrypt certs |

Every image is open source and pullable from Docker Hub. No account or
API key belongs to anyone but you.

---

## What you need

1. A Linux VPS with a public IP. Any host works — Hetzner, Contabo,
   Digital Ocean, a Raspberry Pi at home, your basement server.
   - **Recommended**: 2 vCPU, 4 GB RAM, 40 GB disk. Roughly €4-5/mo on
     Hetzner CAX11 (ARM) or Contabo VPS S. Enough for a few thousand
     students plus their photos.
2. A domain name pointed at that IP with an `A` record (and `AAAA` if
   you want IPv6). Any registrar works — Namecheap, Porkbun,
   Cloudflare (as a registrar only, not a service).
3. Docker Engine + Compose plugin installed on the box. On Ubuntu:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker "$USER" && newgrp docker
   ```

---

## Boot the stack (5 minutes)

```bash
# On your VPS
git clone https://github.com/prateekraj3711-alt/IDcard.git
cd IDcard/deploy

cp .env.example .env
# Edit .env — set DOMAIN, ACME_EMAIL, all the *_PASSWORD fields, and
# a JWT_SECRET (openssl rand -hex 32).
$EDITOR .env

# Bring it all up. First run is slow (image pulls + dashboard npm build).
docker compose up -d

# Watch logs until you see "[bootstrap] schema ok" and Caddy grabs a cert:
docker compose logs -f backend caddy
```

That's it. Visit `https://your-domain` — you'll see the login page.
Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`. The initial
super admin gets created automatically on the first boot.

---

## What each service does, at a glance

- **postgres** — data. Volume `pgdata` is the only thing you need to
  back up. `docker compose exec postgres pg_dump -U idcard idcard >
  backup.sql` for a snapshot.
- **minio** — every photo, template image, and generated PDF. Volume
  `miniodata`. Same backup story. Console at
  `http://your-ip:9001` (only expose over Tailscale or SSH tunnel; don't
  publish it).
- **redis** — sliding-window rate limits + optional session cache.
  Volume `redisdata`. Safe to nuke; the app fails open.
- **backend** — the FastAPI app. Stateless; scale by adding more
  replicas.
- **dashboard-build** — one-shot container that runs `npm install` +
  `npm run build` and dumps the result into a named volume. Caddy
  serves that volume.
- **caddy** — TLS termination via Let's Encrypt, reverse-proxy to
  backend, static file server for the dashboard. Volumes `caddydata` +
  `caddyconfig` hold the certificate and OCSP staple.

The Android app talks to `https://$DOMAIN/api/v1/`. Build a fresh APK
with that URL:

```bash
cd android
./gradlew :app:assembleDebug \
  -PapiBaseUrl="https://your-domain/api/v1/"
```

---

## Backing up

The only durable state lives in three named volumes:

```bash
# ~500 KB per 1k students; grows with photos
docker run --rm \
  -v stark-id_pgdata:/pg -v stark-id_miniodata:/minio \
  -v $(pwd):/backup alpine \
  tar czf /backup/stark-id-$(date +%F).tgz /pg /minio
```

Rsync that tarball off the box on a cron. That's the whole DR plan.

---

## Upgrading

```bash
cd IDcard
git pull
cd deploy
docker compose pull       # base images
docker compose up -d --build  # rebuilds backend + dashboard
```

Alembic migrations run automatically inside the backend container's
`start.sh` on boot.

---

## Frequently second-guessed choices

- **Why not Kubernetes?** Overkill for a two-machine setup. Compose is
  90% of Kubernetes for 10% of the ops surface area, and moving to k3s
  later is a one-day port if you outgrow it.
- **Why Caddy, not nginx?** Caddy handles Let's Encrypt automatically
  from a 20-line config; nginx would need certbot + a renewal cron.
  Same performance for our load.
- **Why MinIO, not just the filesystem?** The app already speaks S3
  end-to-end (presigned uploads from the phone, presigned reads from
  the dashboard). Swapping in filesystem storage would require
  rewriting that flow, and MinIO adds ~30 MB RAM. Not worth changing.
- **Do I need Redis?** No — the rate limiter's `_get_redis` falls open
  if `REDIS_URL` is empty. Remove the service and drop the env var if
  you don't want it.

---

## Hardening beyond the defaults

The compose file gets you running fast. Before you handle real data:

1. **Firewall** — only 80/443 need to be public. Block 9000 (MinIO S3),
   9001 (MinIO console), 5432 (Postgres), 6379 (Redis) at the host
   firewall. UFW on Ubuntu:
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```
2. **SSH keys only** — disable password auth in `/etc/ssh/sshd_config`.
3. **Automatic security updates** — `unattended-upgrades` on Ubuntu.
4. **Off-box backups** — a Backblaze B2 bucket ($6/TB/mo) or a second
   VPS you rsync to. Losing a box shouldn't lose your data.
5. **Rotate JWT_SECRET** on a schedule — every rotation invalidates
   every access token, which is exactly what you want.

---

## Rolling back to a managed provider

The whole point of speaking S3 + Postgres wire is that you can leave.
If self-hosting stops being fun:

- Point `DATABASE_URL` at Neon / Supabase / Cockroach.
- Point `S3_ENDPOINT_URL` at R2 / Storj / Backblaze B2.
- Nothing else changes.

See [`CLOUD_DEPLOY.md`](./CLOUD_DEPLOY.md) for that path.
