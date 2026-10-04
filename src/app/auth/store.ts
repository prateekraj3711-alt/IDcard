import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type Role = 'super_admin' | 'teacher';

export interface CurrentUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  school?: { id: string; code: string; name: string } | null;
  class?: { id: string; name: string } | null;
}

interface AuthState {
  user: CurrentUser | null;
  setUser: (u: CurrentUser | null) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  setUser: (u) => set({ user: u }),
  clear: () => {
    set({ user: null });
    void supabase.auth.signOut();
  },
}));

/** Load profile + role for the signed-in user (Supabase Auth session). */
export async function loadCurrentUser(): Promise<CurrentUser | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, is_active, deleted_at, schools(id, code, name), classes(id, name)').eq('id', auth.user.id).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', auth.user.id),
  ]);
  if (!profile || !profile.is_active || profile.deleted_at || !roles?.length) return null;
  const user: CurrentUser = {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    role: roles.some((r) => r.role === 'super_admin') ? 'super_admin' : 'teacher',
    school: (profile.schools as CurrentUser['school']) ?? null,
    class: ((profile as { classes?: CurrentUser['class'] }).classes) ?? null,
  };
  useAuth.getState().setUser(user);
  return user;
}
