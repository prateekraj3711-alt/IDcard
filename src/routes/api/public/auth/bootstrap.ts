// GET  /api/public/auth/bootstrap — { needs_setup } when no super admin exists yet.
// POST /api/public/auth/bootstrap — create the very first super admin (only allowed once).
// Replaces backend/scripts/create_super_admin.py.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json } from "@/lib/auth-login.server";

async function adminCount() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
  return count ?? 0;
}

const Body = z.object({
  full_name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
});

export const Route = createFileRoute("/api/public/auth/bootstrap")({
  server: {
    handlers: {
      GET: async () => json({ needs_setup: (await adminCount()) === 0 }),
      POST: async ({ request }) => {
        if ((await adminCount()) > 0) return json({ detail: "Setup already completed" }, 403);
        let body: z.infer<typeof Body>;
        try { body = Body.parse(await request.json()); } catch { return json({ detail: "Name, valid email and an 8+ character password are required." }, 400); }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          email: body.email.toLowerCase(), password: body.password, email_confirm: true,
        });
        if (error || !created.user) return json({ detail: error?.message ?? "Could not create account" }, 400);
        const uid = created.user.id;
        await supabaseAdmin.from("profiles").insert({ id: uid, email: body.email.toLowerCase(), full_name: body.full_name, username: body.email.split("@")[0].toLowerCase() });
        await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "super_admin" });
        return json({ ok: true }, 201);
      },
    },
  },
});
