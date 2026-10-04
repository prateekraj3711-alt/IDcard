// Shared server-only helpers for the public auth endpoints (web + Android).
import { createClient } from "@supabase/supabase-js";

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Publishable-key client for signing in on the server; no session persistence. */
export function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

function phoneCandidates(raw: string): string[] {
  const d = raw.replace(/\D/g, "");
  const out = new Set<string>([raw.trim()]);
  if (d.length === 10) { out.add(`+91${d}`); out.add(d); }
  if (d.length === 12 && d.startsWith("91")) { out.add(`+${d}`); out.add(d.slice(2)); }
  if (d) out.add(`+${d}`);
  return [...out];
}

/** Resolve email / username / phone (optionally scoped by school code) to an auth email. */
export async function resolveEmail(identifier: string, schoolCode?: string | null): Promise<string | null> {
  const id = identifier.trim().toLowerCase();
  if (!id) return null;
  if (id.includes("@")) return id;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let schoolId: string | null = null;
  if (schoolCode) {
    const { data: s } = await supabaseAdmin.from("schools").select("id").eq("code", schoolCode.trim().toUpperCase()).is("deleted_at", null).maybeSingle();
    if (!s) return null;
    schoolId = s.id;
  }
  let q = supabaseAdmin.from("profiles").select("email").eq("username", id).is("deleted_at", null);
  if (schoolId) q = q.eq("school_id", schoolId);
  const { data: byUser } = await q.limit(1);
  if (byUser?.[0]) return byUser[0].email;
  let pq = supabaseAdmin.from("profiles").select("email").in("phone", phoneCandidates(identifier)).is("deleted_at", null);
  if (schoolId) pq = pq.eq("school_id", schoolId);
  const { data: byPhone } = await pq.limit(2);
  return byPhone && byPhone.length === 1 ? byPhone[0].email : null;
}

/** Sign in and build the login payload shared by the web dashboard and the Android app. */
export async function performLogin(identifier: string, password: string, schoolCode?: string | null): Promise<{ status: number; body: unknown }> {
  const email = await resolveEmail(identifier, schoolCode);
  if (!email) return { status: 401, body: { detail: "Invalid credentials" } };
  const sb = publicClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { status: 401, body: { detail: "Invalid credentials" } };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin.from("profiles")
    .select("id, full_name, email, username, is_active, deleted_at, school_id, entry_fields, schools(id, code, name, entry_fields)")
    .eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active || profile.deleted_at) return { status: 403, body: { detail: "Account is disabled" } };
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user.id);
  await supabaseAdmin.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", data.user.id);
  const role = roles?.some((r) => r.role === "super_admin") ? "super_admin" : "teacher";
  return {
    status: 200,
    body: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: "bearer",
      expires_in: data.session.expires_in,
      expires_at: data.session.expires_at,
      user: { id: profile.id, full_name: profile.full_name, email: profile.email, username: profile.username, role, school: profile.schools ? { id: profile.schools.id, code: profile.schools.code, name: profile.schools.name } : null,
        // Details this user is asked for each candidate (own list, else organization list; null = all).
        entry_fields: (Array.isArray(profile.entry_fields) ? profile.entry_fields : Array.isArray(profile.schools?.entry_fields) ? profile.schools.entry_fields : null) as string[] | null },
    },
  };
}

/** Client that acts as the caller (RLS applies) using the bearer token from the request. */
export function userClientFromRequest(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const client = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { client, token };
}

/** Resolve the caller; returns null when the token is missing/expired (→ 401 so the app refreshes). */
export async function requireUser(request: Request) {
  const u = userClientFromRequest(request);
  if (!u) return null;
  const { data, error } = await u.client.auth.getUser(u.token);
  if (error || !data.user) return null;
  return { client: u.client, userId: data.user.id };
}

const R = (body: unknown, status = 200) => ({ body, status });

/** Teacher self-signup with a school code (web + Android). */
export async function performTeacherSignup(body: { school_code: string; full_name: string; email: string; phone?: string | null; password: string }): Promise<{ status: number; body: any }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: school } = await supabaseAdmin.from("schools").select("id, code, name")
    .eq("code", body.school_code.toUpperCase()).eq("is_active", true).is("deleted_at", null).maybeSingle();
  if (!school) return R({ detail: "Unknown school code" }, 404);
  const base = body.full_name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 24) || "teacher";
  let username = base;
  for (let i = 0; i < 20; i++) {
    const { data: t } = await supabaseAdmin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (!t) break;
    username = `${base}${Math.floor(Math.random() * 900 + 100)}`;
  }
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: body.email.toLowerCase(), password: body.password, email_confirm: true,
  });
  if (error || !created.user) return R({ detail: error?.message?.includes("registered") ? "Email already registered" : "Could not create account" }, 409);
  const uid = created.user.id;
  const { error: pErr } = await supabaseAdmin.from("profiles").insert({
    id: uid, email: body.email.toLowerCase(), username, full_name: body.full_name, phone: body.phone || null, school_id: school.id,
  });
  if (pErr) { await supabaseAdmin.auth.admin.deleteUser(uid); return R({ detail: "Could not create account" }, 500); }
  await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "teacher" });
  return R({ id: uid, username, email: body.email.toLowerCase(), school }, 201);
}
