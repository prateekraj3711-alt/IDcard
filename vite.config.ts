// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Pre-bundle every heavy client dependency at dev-server start so Vite never
    // re-optimizes mid-session (which invalidates the open tab's module URLs and
    // causes "Failed to fetch dynamically imported module" blank screens).
    optimizeDeps: {
      include: [
        "heic2any",
        "@emotion/react",
        "@emotion/styled",
        "@mui/icons-material/Add",
        "@mui/icons-material/AdminPanelSettings",
        "@mui/icons-material/Analytics",
        "@mui/icons-material/Badge",
        "@mui/icons-material/CardMembership",
        "@mui/icons-material/CloudUpload",
        "@mui/icons-material/Computer",
        "@mui/icons-material/ContentCopy",
        "@mui/icons-material/Delete",
        "@mui/icons-material/DeleteOutline",
        "@mui/icons-material/DesignServices",
        "@mui/icons-material/Download",
        "@mui/icons-material/Edit",
        "@mui/icons-material/Lock",
        "@mui/icons-material/LockOpen",
        "@mui/icons-material/Logout",
        "@mui/icons-material/Menu",
        "@mui/icons-material/People",
        "@mui/icons-material/PersonAddAlt1",
        "@mui/icons-material/PhotoCamera",
        "@mui/icons-material/PhotoLibrary",
        "@mui/icons-material/Print",
        "@mui/icons-material/Refresh",
        "@mui/icons-material/Save",
        "@mui/icons-material/School",
        "@mui/icons-material/SpaceDashboard",
        "@mui/icons-material/Upload",
        "@mui/icons-material/UploadFile",
        "@mui/icons-material/Visibility",
        "@mui/material",
        "@mui/material/styles",
        "@mui/x-data-grid",
        "jszip",
        "konva",
        "pdf-lib",
        "qrcode",
        "qrcode.react",
        "react-konva",
        "use-image",
        "xlsx",
        "@mediapipe/tasks-vision",
        "zustand",
      ],
    },
  },
});
