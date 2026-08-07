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

## Password Reset

Out of scope for MVP teacher flow (admin resets from dashboard: `POST /teachers/{id}/reset-password` returns a one-time link emailed to the teacher).

## Session Revocation

Admin can revoke all sessions for a user (`POST /teachers/{id}/revoke-sessions`) — marks all `refresh_tokens.revoked_at = now()` and increments a `token_version` column on the user; access tokens carry `tv` claim and are rejected when it doesn't match.

## Security Notes

- HTTPS enforced by `Strict-Transport-Security` header.
- JWT secret loaded from environment / KMS; rotated with dual-key window (current + previous).
- Login endpoint rate-limited per IP and per user.
- Timing-safe password comparison via bcrypt.
