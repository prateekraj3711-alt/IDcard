import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { loadCurrentUser } from "@/app/auth/store";
import { AppShell } from "@/app/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    const user = await loadCurrentUser();
    if (!user) {
      await supabase.auth.signOut();
      throw redirect({ to: "/login" });
    }
    return { user };
  },
  component: AppShell,
});
