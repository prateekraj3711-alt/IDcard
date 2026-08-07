# Security

## Threat Model (Summary)

| Actor | Assets | Concerns |
|---|---|---|
| Teacher (compromised phone) | Own school data | Local DB theft, JWT theft, camera abuse |
| Malicious teacher | Other schools' data | Horizontal privilege escalation |
| School admin | Cross-school data | Vertical escalation |
| External attacker | Any data | Broken auth, injection, storage abuse |
| Insider (ops) | Everything | Least privilege via IAM |

## Controls

### Passwords & Auth
- **bcrypt cost 12** for password hashing. No SHA/MD5 anywhere.
- **JWT HS256** for MVP, **RS256** in production with keys in KMS.
- **Access tokens 15 min**, **refresh tokens 7 days**, refresh rotates on use.
- Refresh tokens stored server-side as `sha256(token)` — DB compromise doesn't yield usable tokens.
- Failed-login lockout (5/15 min).
- Optional TOTP MFA for admins (Phase 2).

### Transport
- **HTTPS enforced** end-to-end. HSTS `max-age=63072000; includeSubDomains; preload`.
- TLS 1.2+ only.
- Certificate pinning on Android (OkHttp `CertificatePinner`) for the API host.

### Authorization
- **Role checks** at the router layer via FastAPI dependencies (`Depends(require_role("teacher"))`).
- **Tenant checks** at the service layer — every query joins on `school_id` from the JWT, never from the request body. Enforced by decorator + covered by tests.
- Object-level check on every mutation (`assert student.school_id == request.user.school_id`).

### Input Validation
- Pydantic models with strict typing and length limits.
- Phone: E.164 with `phonenumbers`.
- Email: RFC-validated + lowercase-normalized (`citext`).
- DOB: not in the future; not < 1900.
- Enrollment number: `[A-Z0-9-]{3,30}`.
- Photo: `Content-Type` allowlist, size ≤ 5 MB, MIME sniffed server-side, magic bytes verified.

### Injection & XSS
- SQLAlchemy parameterized queries only (no f-string SQL).
- Dashboard: React auto-escapes; template rendering (ID cards) uses Jinja2 autoescape.
- Content Security Policy on dashboard: `default-src 'self'; img-src 'self' https://cdn.example.com data:; style-src 'self' 'unsafe-inline'`.

### Storage
- S3 bucket **private**, access via presigned URLs only.
- SSE-AES256 at rest; TLS in transit.
- Bucket policy denies `s3:PutObject` without `x-amz-server-side-encryption`.
- Public read via signed CloudFront/R2 URLs, TTL 10 minutes.

### Uploads
- Presigned PUT scoped to `{content-length-range}`, `Content-Type`, and prefix.
- Server verifies `sha256` after upload; virus scan; drop on mismatch/infection.
- Reject files with dangerous extensions or double extensions.

### Rate Limiting
- Redis-backed sliding window: per-IP, per-user, per-endpoint.
- `POST /auth/login`: 10/min/IP + 5/min/username.
- `POST /students`: 60/min/user.
- Photo presign: 60/min/user.
- Bulk endpoints: 5/min/user.

### CORS
- Dashboard origin allowlist only.
- Credentials disabled (JWT in header, not cookies).

### Auditing
- Every mutating operation writes to `audit_logs` with actor, IP, UA, entity, and JSON diff, in the same transaction.
- Retained 1 year online, 7 years cold storage.

### Data Protection
- PII columns (`mobile`, `address`, `father_name`, `mother_name`, `dob`) encrypted at the DB level (pgcrypto column encryption for the highest-sensitivity ones — optional).
- DB backups encrypted (AWS RDS/managed Postgres native encryption).
- Access to prod DB via bastion + short-lived IAM tokens.

### Android App
- Refresh token in `EncryptedSharedPreferences` (AES-256-GCM under AndroidKeystore).
- Root/emulator detection with graceful degrade (block if `ro.debuggable=1` on release builds).
- `android:allowBackup="false"`, `android:usesCleartextTraffic="false"`, `android:networkSecurityConfig="@xml/network_security_config"` with pin set.
- No JWT logging; ProGuard + R8 with `--repackageclasses` + `--allowaccessmodification`.
- Screenshots disabled on Login and Camera screens (`FLAG_SECURE`).

### Dashboard
- Access token in memory only. Refresh via `/auth/refresh` on 401.
- Logout clears in-memory state and revokes refresh token.
- CSRF not required (bearer token, non-cookie), but still validate `Origin` for defense in depth.

### Secrets
- `.env` never committed. Prod secrets via AWS Secrets Manager / SSM.
- Rotate JWT signing key with dual-key window.
- No secrets in logs; structured logging with redaction filter.

### Compliance-Adjacent
- Data residency: single-region deployment aligned with school jurisdiction.
- Right to erasure: super admin can hard-delete a student (audit-logged); cascade removes photos and derived ID cards.

### Logging & Monitoring
- Structured JSON logs (`request_id`, `user_id`, `school_id`, `route`, `status`, `latency_ms`).
- Alerts: > 5 failed logins/min from one IP; > 10 4xx/min per route; abnormal photo upload volume.
- Sentry for both backend and mobile (with PII scrubbing).

## Checklist Before Production

- [ ] Penetration test performed (OWASP Top 10 + mobile OWASP)
- [ ] All routers annotated with role + tenant checks
- [ ] `audit_logs` populated for every write path
- [ ] Backup + restore drill run
- [ ] Secrets in KMS/Secrets Manager
- [ ] WAF in front of API (managed rulesets: OWASP Core, bot control)
- [ ] Bucket policies + Block-Public-Access verified
- [ ] Rate limits tuned against load test
- [ ] Certificate pinning validated on Android release
- [ ] Dashboard CSP tuned; no console errors
