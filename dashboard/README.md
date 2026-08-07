# Admin Dashboard — React + TS + MUI

## Run locally

```bash
npm install
npm run dev
```

Vite dev server proxies `/api` to `http://localhost:8000`.

## Structure

```
src/
├── main.tsx                    # QueryClient + MUI theme + Router
├── App.tsx                     # Routes
├── theme.ts                    # MUI theme
├── auth/
│   ├── store.ts                # Zustand auth store (tokens + user)
│   └── ProtectedRoute.tsx      # gates authenticated routes
├── api/
│   ├── client.ts               # axios + 401 → refresh interceptor
│   └── endpoints.ts            # typed API surface
├── components/AppShell.tsx     # AppBar + Drawer + <Outlet />
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── SchoolsPage.tsx
│   ├── TeachersPage.tsx
│   ├── StudentsPage.tsx
│   ├── StudentProfilePage.tsx  # photo + QR + ID card actions
│   ├── IdCardsPage.tsx
│   └── AnalyticsPage.tsx
└── types.ts
```

## Notes

- **Access token** stored in `sessionStorage` (memory-persistent) — cleared on tab close except when refresh flow keeps the session alive.
- **Refresh token** in `localStorage` for cross-tab persistence.
- CORS: bearer-token auth, so no CSRF needed; server validates `Origin` as defense in depth.
- Data grid uses server-side pagination.
