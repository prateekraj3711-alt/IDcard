// POST /api/public/auth/signup-teacher — teacher self-signup with a school code (Android signup screen).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, performTeacherSignup } from "@/lib/auth-login.server";

const Body = z.object({
  school_code: z.string().trim().min(1).max(16),
  full_name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8).max(72),
});

export const Route = createFileRoute("/api/public/auth/signup-teacher")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try { body = Body.parse(await request.json()); } catch { return json({ detail: "Please fill all fields (password at least 8 characters)." }, 400); }
        const r = await performTeacherSignup(body);
        return json(r.body, r.status);
      },
    },
  },
});
