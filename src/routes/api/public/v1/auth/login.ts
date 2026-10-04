// Android contract: POST /api/public/v1/auth/login — same body/response shape the app always used.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, performLogin } from "@/lib/auth-login.server";

const Body = z.object({
  school_code: z.string().trim().max(16).nullish(),
  username: z.string().trim().max(100).nullish(),
  email: z.string().trim().max(255).nullish(),
  phone: z.string().trim().max(30).nullish(),
  password: z.string().min(1).max(200),
  device_id: z.string().max(100).nullish(),
});

export const Route = createFileRoute("/api/public/v1/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let b: z.infer<typeof Body>;
        try { b = Body.parse(await request.json()); } catch { return json({ detail: "Invalid request" }, 400); }
        const r = await performLogin(b.email || b.username || b.phone || "", b.password, b.school_code);
        return json(r.body, r.status);
      },
    },
  },
});
