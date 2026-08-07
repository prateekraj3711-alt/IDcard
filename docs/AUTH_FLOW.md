# Authentication Flow

## Overview

- **Access token**: JWT, HS256 (or RS256 in prod), 15-minute TTL, sent as `Authorization: Bearer …`.
- **Refresh token**: opaque 256-bit random, 7-day TTL, sha256-hashed at rest, single-use (rotates on refresh).
- **Password hashing**: bcrypt cost 12.
- **Storage on Android**: refresh token in `EncryptedSharedPreferences` (AES-256-GCM under the AndroidKeystore); access token kept only in memory.

## JWT Claims

```json
{
  "sub":  "3f0…",              // user id
  "role": "teacher",
  "sid":  "1a…",              // school_id (null for super_admin)
  "sco":  ["students:write", "photos:write"],
  "iat":  1732459200,
  "exp":  1732460100,
  "jti":  "…",
  "iss":  "idcard-api",
  "aud":  "idcard-client"
}
```

Middleware verifies signature, `exp`, `iss`/`aud`, and populates `request.state.user`. The `sid` claim is authoritative — the request body's `school_id` must equal it (except for super admin).

## Sequences

### Teacher Login
```
Android                    API                     DB
  │  POST /auth/login       │                       │
  │  school_code, user, pw  │                       │
  ├────────────────────────►│                       │
  │                         │ lookup school by code │
  │                         ├──────────────────────►│
  │                         │◄──────────────────────┤
  │                         │ lookup user           │
  │                         ├──────────────────────►│
  │                         │◄──────────────────────┤
  │                         │ bcrypt.verify         │
  │                         │ issue access + refresh│
  │                         │ INSERT refresh_tokens │
  │                         ├──────────────────────►│
  │◄────────────────────────┤                       │
  │  200 tokens + user      │                       │
  │                         │                       │
  │  store refresh in       │                       │
  │  EncryptedSharedPrefs   │                       │
```

### Access Token Refresh
```
Android                    API                     DB
  │  POST /auth/refresh     │                       │
  │  refresh_token          │                       │
  ├────────────────────────►│                       │
  │                         │ SELECT refresh where  │
  │                         │  hash = sha256(rt)    │
  │                         │  AND revoked_at NULL  │
  │                         │  AND expires_at > now │
  │                         │ mark revoked          │
  │                         │ issue new pair        │
  │                         │ INSERT new refresh    │
  │◄────────────────────────┤                       │
  │  200 new pair           │                       │
```

If refresh returns `401`, the app clears local tokens and routes to login.

### Automatic Login (App Cold Start)
1. App reads refresh token from `EncryptedSharedPreferences`.
2. Calls `POST /auth/refresh`.
3. On success → home; on failure → login.

## Retry / Interceptor Design (Android)

- `AuthInterceptor` — attaches `Authorization` header.
- `TokenAuthenticator` (OkHttp `Authenticator`) — on `401`, atomically refreshes and retries the original request once. Uses a `Mutex` to prevent thundering-herd refresh on parallel requests.

## Failed-Login Lockout

- Increment `users.failed_login_attempts` on wrong password.
- After 5 consecutive failures within 15 minutes → `423 Locked` until 15 min pass.
- Any successful login resets the counter.

## Credential Provisioning (Super Admin → Teacher)

There is no self-service teacher signup. The super admin creates the teacher account:

1. Super admin submits `POST /teachers` with the teacher's name, email, and school. Username and password may be omitted.
2. If omitted, the server generates:
   - **Username** — normalized from the full name (`priya.sharma`, `priya.sharma1`, …) with a uniqueness suffix.
   - **Password** — 12 chars from `secrets.choice()` over a reduced alphabet (no `I l O 0 1`).
3. The plaintext password is returned **once** in the create response, and only in that response — bcrypt-hashed in `users.password_hash`. It is never retrievable again.
4. The super admin passes the credentials to the teacher out-of-band (SMS, email, printed slip).
5. Teacher logs in with `school_code + username + password`.

## Password Reset

- Super admin calls `POST /teachers/{id}/regenerate-password`, which:
  1. Generates a new plaintext password.
  2. Updates `password_hash`.
  3. Increments `users.token_version` — invalidating every existing access token.
  4. Sets `failed_login_attempts = 0`.
  5. Returns the new plaintext password **once**.
- Teacher-initiated reset is out of scope for MVP.

## Session Revocation

Admin can revoke all sessions for a user (`POST /teachers/{id}/revoke-sessions`) — marks all `refresh_tokens.revoked_at = now()` and increments a `token_version` column on the user; access tokens carry `tv` claim and are rejected when it doesn't match.

## Security Notes

- HTTPS enforced by `Strict-Transport-Security` header.
- JWT secret loaded from environment / KMS; rotated with dual-key window (current + previous).
- Login endpoint rate-limited per IP and per user.
- Timing-safe password comparison via bcrypt.
