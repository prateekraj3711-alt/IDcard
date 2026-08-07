# Stark ID — Desktop (Tauri)

Windows / macOS / Linux native app that wraps the React admin portal so
all heavy work (photo folder ingest, template rendering, ID card
generation) happens on the operator's machine.

Reuses `../dashboard/dist/` as its bundled frontend, so any change to
the web portal is picked up automatically on the next `npm run build`.

## Why native

The web portal is the right shape for CRUD (schools, teachers,
students, admins, audit). The photo pipeline is not — a 90 MB ZIP
plus 100 photos rendered at 500 DPI × 4 gunicorn workers on
Render's 512 MB free tier is the OOM crash we kept hitting.

Native gives us:
- Direct filesystem reads (no upload, no size limit)
- Multi-GB working memory
- GPU-accelerated canvas rendering via WebView2 / WKWebView / WebKit
- Writes output PDFs straight to disk

The backend stays the same — identity, tenancy, audit, syncing
finished students back to the server. Only the heavy operator flow
moves.

## Stack

- **Tauri 1.x** — Rust shell + system WebView. Installer is ~5 MB
  vs ~100 MB for an equivalent Electron build.
- **React** — the *exact* dashboard code from `../dashboard`. A bridge
  utility (`src/desktopBridge.ts` shared with the web build) detects
  `window.__TAURI__` and swaps the upload endpoints for local file
  APIs.
- **pdf-lib + Konva** — local ID card rendering and PDF export.

## Layout

```
desktop/
├── src-tauri/
│   ├── Cargo.toml           # Rust deps
│   ├── tauri.conf.json      # Window, bundle, permissions
│   ├── build.rs
│   ├── icons/               # App icons per platform
│   └── src/main.rs          # Command handlers (pick_folder, list_photos, etc)
├── package.json             # Build orchestration
└── README.md
```

## Develop locally

Prerequisites:
- Rust toolchain (`rustup`)
- Node 20
- Windows: WebView2 runtime (pre-installed on Win11)
- macOS: Xcode CLI Tools
- Linux: `webkit2gtk-4.0`, `libssl-dev`, `libgtk-3-dev` (Ubuntu 22.04+)

```bash
# From repo root
cd dashboard && npm install && npm run build    # produces dashboard/dist
cd ../desktop && npm install
npx tauri dev                                    # opens dev window
```

## Ship a binary

Tags on the branch trigger `.github/workflows/desktop-release.yml`
which builds:

- `Stark-ID-{version}-x64.msi` (Windows)
- `Stark-ID-{version}.dmg` (macOS)
- `stark-id-{version}.AppImage` (Linux)

Artifacts are attached to the GitHub Release automatically.

## Local file operations

The Rust side exposes four commands:

| command | purpose |
|---|---|
| `pick_file(extensions: Vec<String>)` | Open native file dialog, return absolute path |
| `pick_folder()` | Open native folder dialog, return absolute path |
| `list_folder(path, ext_filter?)` | Enumerate files (name + size + modified) |
| `read_bytes_base64(path)` | Return a file's contents base64-encoded |
| `write_bytes_base64(path, b64)` | Write base64 to disk (used for generated PDFs) |

The frontend calls these via `@tauri-apps/api/tauri.invoke`. The
`desktopBridge` module in the dashboard falls back to the browser
`<input type="file">` when running in a normal browser.
