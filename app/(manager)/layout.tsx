import { Frame } from "@/components/layout/Frame";
import {
  Sidebar,
  ADMIN_SIDEBAR_GROUPS,
  MANAGER_SIDEBAR_GROUPS,
} from "@/components/layout/Sidebar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Layout del grupo (manager). Las pantallas viven bajo /manager/* pero el
 * admin también las consume (Reseñas global, Exportar Excel, vista de
 * comerciales). Cuando entra un admin le mostramos su sidebar de admin
 * y un subtítulo distinto; al gestor real le mostramos el suyo.
 */
export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile: { full_name: string; role: string; avatar_url: string | null } | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const res = await supabase
        .from("profiles")
        .select("full_name, role, avatar_url")
        .eq("id", user.id)
        .maybeSingle<{ full_name: string; role: string; avatar_url: string | null }>();
      profile = res.data;
    }
  }

  const isAdmin = profile?.role === "admin";
  const groups = isAdmin ? ADMIN_SIDEBAR_GROUPS : MANAGER_SIDEBAR_GROUPS;
  const user = isAdmin
    ? {
        name: profile?.full_name ?? "Administrador",
        subtitle: "Admin · Inseryal",
        avatarUrl: profile?.avatar_url,
      }
    : {
        name: profile?.full_name ?? "Gestor de reseñas",
        subtitle: "Gestor · Inseryal",
        avatarUrl: profile?.avatar_url,
      };

  return (
    <Frame>
      <Sidebar groups={groups} user={user} />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {children}
      </main>
    </Frame>
  );
}
