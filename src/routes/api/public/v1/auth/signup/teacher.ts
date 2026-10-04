// Android contract: POST /api/public/v1/auth/signup/teacher → creates the teacher and signs them in.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, performLogin, performTeacherSignup } from "@/lib/auth-login.server";

const Body = z.object({
  school_code: z.string().trim().min(1).max(16),
  full_name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(20).nullish(),
  password: z.string().min(8).max(72),
  device_id: z.string().max(100).nullish(),
});

export const Route = createFileRoute("/api/public/v1/auth/signup/teacher")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let b: z.infer<typeof Body>;
        try { b = Body.parse(await request.json()); } catch { return json({ detail: "School code, name, email and a password of at least 8 characters are required." }, 400); }
        const created = await performTeacherSignup(b);
        if (created.status !== 201) return json(created.body, created.status);
        const r = await performLogin(b.email, b.password);
        return json(r.body, r.status === 200 ? 201 : r.status);
      },
    },
  },
});
