// POST /api/public/auth/login — sign in with email, username or phone (+ optional school_code).
// Used by the web dashboard and the Android app. Returns a standard auth session.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, performLogin } from "@/lib/auth-login.server";

const Body = z.object({
  identifier: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(30).optional(),
  username: z.string().trim().max(100).optional(),
  school_code: z.string().trim().max(16).optional(),
  password: z.string().min(1).max(200),
});

export const Route = createFileRoute("/api/public/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try { body = Body.parse(await request.json()); } catch { return json({ detail: "Invalid request" }, 400); }
        const r = await performLogin(body.identifier ?? body.email ?? body.username ?? body.phone ?? "", body.password, body.school_code);
        return json(r.body, r.status);
      },
    },
  },
});
