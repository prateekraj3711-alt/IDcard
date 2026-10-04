// Android contract: GET /api/public/v1/schools/available — schools the signed-in user may work with.
import { createFileRoute } from "@tanstack/react-router";
import { json, requireUser } from "@/lib/auth-login.server";

export const Route = createFileRoute("/api/public/v1/schools/available")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = await requireUser(request);
        if (!u) return json({ detail: "Not authenticated" }, 401);
        const { data, error } = await u.client.from("schools").select("id, code, name")
          .eq("is_active", true).is("deleted_at", null).order("name");
        if (error) return json({ detail: "Could not load schools" }, 500);
        return json(data ?? []);
      },
    },
  },
});
