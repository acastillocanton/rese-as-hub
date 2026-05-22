import { redirect } from "next/navigation";
import { Frame } from "@/components/layout/Frame";
import {
  Sidebar,
  ADMIN_SIDEBAR_GROUPS,
  SALES_SIDEBAR_GROUPS,
  MANAGER_SIDEBAR_GROUPS,
} from "@/components/layout/Sidebar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Layout del grupo (profile). /perfil es accesible a TODOS los roles
 * (admin, sales, reviews_manager) — cada uno ve el sidebar que le toca.
 * Hacemos la query del rol aquí mismo para escoger qué chrome pintar.
 */
export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile: {
    full_name: string;
    role: string;
    avatar_url: string | null;
  } | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const res = await supabase
      .from("profiles")
      .select("full_name, role, avatar_url")
      .eq("id", user.id)
      .maybeSingle<{ full_name: string; role: string; avatar_url: string | null }>();
    profile = res.data;
  }

  const role = profile?.role;
  const groups =
    role === "admin"
      ? ADMIN_SIDEBAR_GROUPS
      : role === "reviews_manager"
        ? MANAGER_SIDEBAR_GROUPS
        : SALES_SIDEBAR_GROUPS;

  const subtitle =
    role === "admin"
      ? "Admin · Inseryal"
      : role === "reviews_manager"
        ? "Gestor · Inseryal"
        : "Comercial";

  return (
    <Frame>
      <Sidebar
        groups={groups}
        user={{
          name: profile?.full_name ?? "Usuario",
          subtitle,
          avatarUrl: profile?.avatar_url,
        }}
      />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {children}
      </main>
    </Frame>
  );
}
