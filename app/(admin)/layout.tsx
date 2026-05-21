import { Frame } from "@/components/layout/Frame";
import {
  Sidebar,
  ADMIN_SIDEBAR_GROUPS,
  MANAGER_SIDEBAR_GROUPS,
} from "@/components/layout/Sidebar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Layout del grupo (admin). Algunas pantallas (Dashboard, /comerciales,
 * /comerciales/[slug]) son visibles también para el gestor de reseñas con
 * las acciones de edición ocultas. Por eso este layout detecta el rol y
 * pinta el sidebar correcto: admin o gestor — misma URL, distinto chrome.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile: { full_name: string; role: string } | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const res = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .maybeSingle<{ full_name: string; role: string }>();
      profile = res.data;
    }
  }

  const isManager = profile?.role === "reviews_manager";
  const groups = isManager ? MANAGER_SIDEBAR_GROUPS : ADMIN_SIDEBAR_GROUPS;
  const user = isManager
    ? {
        name: profile?.full_name ?? "Gestor de reseñas",
        subtitle: "Lectura · Inseryal",
      }
    : { name: profile?.full_name ?? "Administrador", subtitle: "Admin · Inseryal" };

  return (
    <Frame>
      <Sidebar groups={groups} user={user} />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {children}
      </main>
    </Frame>
  );
}
