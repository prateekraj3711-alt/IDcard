// Privileged account management (replaces backend admins/teachers routers).
// Service-role access stays server-side; every call verifies the caller is a super admin.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> }; userId: string };

async function assertSuperAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
  if (!data) throw new Error("Only super admins can manage accounts.");
}

function generatePassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 24) || "user";
}

async function ensureClass(schoolId: string, name: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const n = name.trim();
  const { data: found } = await supabaseAdmin.from("classes").select("id").eq("school_id", schoolId).eq("name", n).maybeSingle();
  if (found) return found.id;
  const { data: made, error } = await supabaseAdmin.from("classes").insert({ school_id: schoolId, name: n }).select("id").single();
  if (error || !made) throw new Error(error?.message ?? "Could not create class.");
  return made.id;
}

/** Assign (or clear) the class a user may see and add candidates for. */
export const setAccountClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), class_name: z.string().trim().max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin.from("profiles").select("school_id").eq("id", data.user_id).single();
    if (data.class_name && !p?.school_id) throw new Error("Assign the user to an organization first.");
    const class_id = data.class_name ? await ensureClass(p!.school_id!, data.class_name) : null;
    const { error } = await supabaseAdmin.from("profiles").update({ class_id }).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ role: z.enum(["super_admin", "teacher"]), school_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error: rErr } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", data.role);
    if (rErr) throw new Error(rErr.message);
    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];
    let q = supabaseAdmin.from("profiles").select("*, schools(id, code, name), classes(id, name)").in("id", ids).is("deleted_at", null).order("created_at");
    if (data.school_id) q = q.eq("school_id", data.school_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((p) => ({
      id: p.id, full_name: p.full_name, email: p.email, phone: p.phone, username: p.username,
      role: data.role, is_active: p.is_active, last_login_at: p.last_login_at, created_at: p.created_at,
      school: p.schools ?? null,
      class: (p as { classes?: { id: string; name: string } | null }).classes ?? null,
    }));
  });

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      role: z.enum(["super_admin", "teacher"]),
      full_name: z.string().trim().min(1).max(150),
      email: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
        z.string().trim().email().max(255).optional(),
      ),
      phone: z.string().trim().max(20).optional(),
      username: z.string().trim().max(50).optional(),
      password: z.string().min(8).max(72).optional(),
      school_id: z.string().uuid().optional(),
      class_name: z.string().trim().max(50).optional(),
      entry_fields: z.array(z.string().max(60)).max(100).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as unknown as Ctx);
    if (data.role === "teacher" && !data.school_id) throw new Error("Choose a school for the teacher.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = data.password || generatePassword();
    let username = (data.username || slug(data.full_name)).toLowerCase();
    for (let i = 0; i < 20; i++) {
      const { data: taken } = await supabaseAdmin.from("profiles").select("id").eq("username", username).maybeSingle();
      if (!taken) break;
      username = `${slug(data.full_name)}${Math.floor(Math.random() * 900 + 100)}`;
    }
    // Email is optional: accounts without one get an internal placeholder so
    // they can still sign in with username or phone.
    const email = data.email?.toLowerCase() || `${username}@no-email.local`;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create account.");
    const uid = created.user.id;
    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      id: uid, email, username, full_name: data.full_name,
      phone: data.phone || null, school_id: data.role === "teacher" ? data.school_id! : null,
      class_id: data.role === "teacher" && data.class_name ? await ensureClass(data.school_id!, data.class_name) : null,
      entry_fields: data.role === "teacher" ? (data.entry_fields ?? null) : null,
    });
    const { error: roleErr } = pErr ? { error: pErr } : await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    if (pErr || roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error((pErr ?? roleErr)!.message);
    }
    await supabaseAdmin.from("audit_logs").insert({ user_id: context.userId, action: `${data.role}.create`, entity_type: "user", entity_id: uid });
    return {
      id: uid, full_name: data.full_name, email, phone: data.phone ?? null, role: data.role,
      is_active: true, last_login_at: null, created_at: new Date().toISOString(), school: null,
      credentials: { username, password },
    };
  });

export const regenerateAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(72).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = data.password || generatePassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password });
    if (error) throw new Error(error.message);
    const { data: p } = await supabaseAdmin.from("profiles").select("username, email").eq("id", data.user_id).single();
    return { user_id: data.user_id, credentials: { username: p?.username ?? p?.email ?? "", password } };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as unknown as Ctx);
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", data.user_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
