// Android contract: POST /api/public/v1/students/{id}/photo — multipart "file" (JPEG, already 720x960 on device).
// Replaces the old presigned-URL two-step. Uploads to private storage as the caller, then records metadata.
import { createFileRoute } from "@tanstack/react-router";
import { json, requireUser } from "@/lib/auth-login.server";

const MAX_BYTES = 5 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

export const Route = createFileRoute("/api/public/v1/students/$id/photo")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const u = await requireUser(request);
        if (!u) return json({ detail: "Not authenticated" }, 401);
        if (!UUID_RE.test(params.id)) return json({ detail: "Invalid student id" }, 400);
        let file: File | null = null;
        try { const f = (await request.formData()).get("file"); file = f instanceof File ? f : null; } catch { /* fallthrough */ }
        if (!file) return json({ detail: "Send the photo as multipart field 'file'." }, 400);
        if (file.size > MAX_BYTES) return json({ detail: "Photo is larger than 5 MB." }, 413);
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return json({ detail: "Only JPEG photos are accepted." }, 415);
        const dim = jpegSize(bytes);

        const { data: student } = await u.client.from("students").select("id, school_id, photo_hash").eq("id", params.id).is("deleted_at", null).maybeSingle();
        if (!student) return json({ detail: "Student not found" }, 404);

        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const sha256 = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
        const path = `${student.school_id}/${student.id}/${sha256}.jpg`;
        if (student.photo_hash === sha256) return json({ photo_path: path, sha256, duplicate: true }, 200);

        const up = await u.client.storage.from("student-photos").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
        if (up.error) return json({ detail: "Photo storage refused the upload (permission or quota)." }, 403);
        const { data: photo, error } = await u.client.rpc("record_student_photo", {
          _student_id: student.id, _storage_path: path, _size_bytes: bytes.length,
          _width: dim?.width ?? null, _height: dim?.height ?? null, _sha256: sha256, _content_type: "image/jpeg",
        } as never);
        if (error) return json({ detail: "Photo uploaded but could not be saved — please retry." }, 500);
        await u.client.from("sync_logs").insert({ student_id: student.id, operation: "photo_upload", status: "uploaded", user_id: u.userId });
        return json({ photo_id: (photo as { id?: string } | null)?.id ?? null, photo_path: path, sha256, size_bytes: bytes.length, width: dim?.width ?? null, height: dim?.height ?? null, duplicate: false }, 201);
      },
    },
  },
});
