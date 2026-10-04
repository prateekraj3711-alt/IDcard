// Android contract: POST /api/public/v1/students — idempotent create keyed on client_uuid (offline-first sync).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, requireUser } from "@/lib/auth-login.server";

const opt = (n: number) => z.string().trim().max(n).nullish();
const Body = z.object({
  client_uuid: z.string().uuid(),
  school_id: z.string().uuid(),
  class_id: z.string().uuid().nullish(),
  section_id: z.string().uuid().nullish(),
  enrollment_no: z.string().trim().max(64).nullish(),
  roll_no: opt(32), name: z.string().trim().min(1).max(150),
  father_name: opt(150), mother_name: opt(150), dob: opt(10), blood_group: opt(8),
  gender: z.enum(["male", "female", "other"]).nullish(), address: opt(500), mobile: opt(20), enrolled_on: opt(10),
  status: z.enum(["draft", "submitted", "active", "archived"]).default("active"),
  extra: z.record(z.string().max(60), z.string().trim().max(500)).nullish(),
});
const COLS = "id, client_uuid, school_id, class_id, section_id, enrollment_no, roll_no, name, father_name, mother_name, dob, blood_group, gender, address, mobile, enrolled_on, status, photo_path, photo_hash, extra";

export const Route = createFileRoute("/api/public/v1/students")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const u = await requireUser(request);
        if (!u) return json({ detail: "Not authenticated" }, 401);
        let b: z.infer<typeof Body>;
        try { b = Body.parse(await request.json()); } catch (e) { return json({ detail: "Invalid student data", errors: (e as z.ZodError).issues ?? null }, 422); }
        // Idempotent replay: same client_uuid returns the existing row.
        const existing = await u.client.from("students").select(COLS).eq("client_uuid", b.client_uuid).maybeSingle();
        if (existing.data) return json(existing.data, 200);
        const row = { ...b, enrollment_no: b.enrollment_no ? b.enrollment_no.toUpperCase() : null, extra: b.extra ?? {}, created_by: u.userId };
        const { data, error } = await u.client.from("students").insert(row).select(COLS).single();
        if (error) {
          if (error.code === "23505") return json({ detail: "A student with this enrollment number already exists in this school." }, 409);
          if (error.code === "42501") return json({ detail: "You don't have access to this school." }, 403);
          return json({ detail: "Could not save student" }, 500);
        }
        await u.client.from("sync_logs").insert({ student_id: data.id, client_uuid: b.client_uuid, operation: "create", status: "uploaded", user_id: u.userId });
        return json(data, 201);
      },
    },
  },
});
