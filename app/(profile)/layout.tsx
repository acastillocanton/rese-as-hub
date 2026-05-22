import { redirect } from "next/navigation";
import { Frame } from "@/components/layout/Frame";
import {
  Sidebar,
  ADMIN_SIDEBAR_GROUPS,
  SALES_SIDEBAR_GROUPS,
  MANAGER_SIDEBAR_GROUPS,
} from "@/components/layout/Sidebar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Layout del grupo (profile). /perfil es accesible a TODOS los roles
 * (admin, sales, reviews_manager) — cada uno ve el sidebar que le toca.
 * Hacemos la query del rol aquí mismo para escoger qué chrome pintar.
 *
 * En mobile: si el rol es `sales`, montamos el mismo wrapper que
 * `(sales)/layout` para que el comercial pueda volver al panel via la
 * tab bar. Admin/manager no tienen vista mobile, así que ven el sidebar
 * desktop independientemente del viewport (caso esquina, no son uso
 * mobile en producción).
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
  const isSales = role === "sales";
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
      {/* /perfil es global a los tres roles. En mobile el sidebar SIEMPRE
          se oculta (de cualquier rol) — un sidebar de 232px aplastaría
          la página de perfil en un viewport de 375-430px. Para volver
          al resto de la app, sales tiene la MobileTabBar; admin/manager
          tienen un botón "← Volver" en el topbar de /perfil (ver
          ProfileBackButton.tsx). */}
      <div className="sales-hide-mobile" style={{ display: "contents" }}>
        <Sidebar
          groups={groups}
          user={{
            name: profile?.full_name ?? "Usuario",
            subtitle,
            avatarUrl: profile?.avatar_url,
          }}
        />
      </div>
      <main
        className="sales-main"
        style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        {children}
      </main>
      {/* Tab bar mobile solo si el rol es sales — admin/manager no
          tienen esa chrome de navegación. */}
      {isSales && (
        <div className="sales-hide-desktop">
          <MobileTabBar />
        </div>
      )}
    </Frame>
  );
}
