// Android contract: POST /api/public/v1/auth/refresh {refresh_token} → new token pair.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, publicClient } from "@/lib/auth-login.server";

const Body = z.object({ refresh_token: z.string().min(1).max(2000), device_id: z.string().max(100).nullish() });

export const Route = createFileRoute("/api/public/v1/auth/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let b: z.infer<typeof Body>;
        try { b = Body.parse(await request.json()); } catch { return json({ detail: "Invalid request" }, 400); }
        const { data, error } = await publicClient().auth.refreshSession({ refresh_token: b.refresh_token });
        if (error || !data.session) return json({ detail: "Session expired — please sign in again" }, 401);
        return json({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          token_type: "bearer",
          expires_in: data.session.expires_in,
        });
      },
    },
  },
});
