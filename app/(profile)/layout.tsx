import { redirect } from "next/navigation";
import { Frame } from "@/components/layout/Frame";
import {
  Sidebar,
  ADMIN_SIDEBAR_GROUPS,
  SALES_SIDEBAR_GROUPS,
  MANAGER_SIDEBAR_GROUPS,
  OFFICE_DIRECTOR_SIDEBAR_GROUPS,
} from "@/components/layout/Sidebar";
import {
  MobileTabBar,
  SALES_MOBILE_TABS,
  DIRECTOR_MOBILE_TABS,
} from "@/components/layout/MobileTabBar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Layout del grupo (profile). /perfil es accesible a los 4 roles
 * (admin, sales, reviews_manager, office_director) — cada uno ve el
 * sidebar que le toca. Hacemos la query del rol aquí mismo para escoger
 * qué chrome pintar.
 *
 * En mobile: si el rol tiene vista mobile (sales u office_director),
 * pintamos el mismo wrapper que su layout principal para que pueda
 * volver al resto de pantallas via la tab bar. Admin/reviews_manager no
 * tienen vista mobile, así que ven el sidebar desktop independientemente
 * del viewport (caso esquina, no son uso mobile en producción).
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
  const isDirector = role === "office_director";
  const hasMobileChrome = isSales || isDirector;
  const groups =
    role === "admin"
      ? ADMIN_SIDEBAR_GROUPS
      : role === "reviews_manager"
        ? MANAGER_SIDEBAR_GROUPS
        : role === "office_director"
          ? OFFICE_DIRECTOR_SIDEBAR_GROUPS
          : SALES_SIDEBAR_GROUPS;

  const subtitle =
    role === "admin"
      ? "Admin · Inseryal"
      : role === "reviews_manager"
        ? "Gestor · Inseryal"
        : role === "office_director"
          ? "Director · Inseryal"
          : "Comercial";

  return (
    <Frame>
      {/* /perfil es global a los 4 roles. En mobile el sidebar SIEMPRE
          se oculta (de cualquier rol) — un sidebar de 232px aplastaría
          la página de perfil en un viewport de 375-430px. Para volver
          al resto de la app, sales y office_director tienen la
          MobileTabBar; admin/reviews_manager tienen un botón "← Volver"
          en el topbar de /perfil (ver ProfileBackButton.tsx). */}
      <div className="m-hide-mobile" style={{ display: "contents" }}>
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
        className="m-main"
        style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        {children}
      </main>
      {/* Tab bar mobile solo si el rol tiene vista mobile. */}
      {hasMobileChrome && (
        <div className="m-hide-desktop">
          <MobileTabBar tabs={isDirector ? DIRECTOR_MOBILE_TABS : SALES_MOBILE_TABS} />
        </div>
      )}
    </Frame>
  );
}
