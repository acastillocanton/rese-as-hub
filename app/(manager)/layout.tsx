import { Frame } from "@/components/layout/Frame";
import {
  Sidebar,
  ADMIN_SIDEBAR_GROUPS,
  MANAGER_SIDEBAR_GROUPS,
  OFFICE_DIRECTOR_SIDEBAR_GROUPS,
} from "@/components/layout/Sidebar";
import {
  MobileTabBar,
  DIRECTOR_MOBILE_TABS,
} from "@/components/layout/MobileTabBar";
import { MobileProfileAvatar } from "@/components/layout/MobileProfileAvatar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_BRAND, getBrandLabel } from "@/lib/branding";
import type { Brand } from "@/lib/supabase/types";

/**
 * Layout del grupo (manager). Las pantallas viven bajo /manager/* pero
 * también las consumen admin, reviews_manager y office_director (este último
 * solo /manager/export, por middleware). Pintamos el sidebar coherente con
 * el rol del usuario y el subtítulo correspondiente.
 */
export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile: {
    full_name: string;
    role: string;
    avatar_url: string | null;
    locations: { brand: Brand } | null;
  } | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const res = await supabase
        .from("profiles")
        .select("full_name, role, avatar_url, locations:locations(brand)")
        .eq("id", user.id)
        .maybeSingle<{
          full_name: string;
          role: string;
          avatar_url: string | null;
          locations: { brand: Brand } | null;
        }>();
      profile = res.data;
    }
  }

  // Unread support count for sidebar badge
  let supportUnread = 0;
  if (isSupabaseConfigured()) {
    const sb = await createClient();
    const { data: unreadData } = await sb.rpc("support_unread_count");
    if (typeof unreadData === "number") supportUnread = unreadData;
  }

  const role = profile?.role ?? null;
  const brand: Brand = profile?.locations?.brand ?? DEFAULT_BRAND;
  const brandLabel = getBrandLabel(brand);
  const groups =
    role === "admin"
      ? ADMIN_SIDEBAR_GROUPS
      : role === "office_director"
        ? OFFICE_DIRECTOR_SIDEBAR_GROUPS
        : MANAGER_SIDEBAR_GROUPS;
  const user =
    role === "admin"
      ? {
          name: profile?.full_name ?? "Administrador",
          subtitle: `Admin · ${brandLabel}`,
          avatarUrl: profile?.avatar_url,
        }
      : role === "office_director"
        ? {
            name: profile?.full_name ?? "Director de oficina",
            subtitle: `Director · ${brandLabel}`,
            avatarUrl: profile?.avatar_url,
          }
        : {
            name: profile?.full_name ?? "Gestor de reseñas",
            subtitle: `Gestor · ${brandLabel}`,
            avatarUrl: profile?.avatar_url,
          };

  const isDirector = role === "office_director";

  return (
    <Frame>
      <div
        className={isDirector ? "m-hide-mobile" : undefined}
        style={{ display: "contents" }}
      >
        <Sidebar groups={groups} user={user} supportUnread={supportUnread} />
      </div>
      <main
        className={isDirector ? "m-main" : undefined}
        style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        {children}
      </main>
      {isDirector && (
        <div className="m-hide-desktop">
          <MobileProfileAvatar
            name={user.name}
            avatarUrl={user.avatarUrl ?? null}
          />
          <MobileTabBar tabs={DIRECTOR_MOBILE_TABS} />
        </div>
      )}
    </Frame>
  );
}
