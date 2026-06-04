import { Frame } from "@/components/layout/Frame";
import {
  Sidebar,
  SALES_SIDEBAR_GROUPS,
  OFFICE_DIRECTOR_SIDEBAR_GROUPS,
} from "@/components/layout/Sidebar";
import {
  MobileTabBar,
  SALES_MOBILE_TABS,
  DIRECTOR_MOBILE_TABS,
} from "@/components/layout/MobileTabBar";
import { MobileProfileAvatar } from "@/components/layout/MobileProfileAvatar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_BRAND, getBrandLabel } from "@/lib/branding";
import type { Brand } from "@/lib/supabase/types";

/**
 * Layout del grupo (sales). Lo consumen DOS roles:
 *   - `sales` (rol original): panel comercial puro.
 *   - `office_director` (rol dual): entra aquí cuando navega a su panel
 *     productor (`/panel/*`, `/clientes/*`). Le pintamos su sidebar y sus
 *     mobile tabs propios para que pueda volver a Dashboard, Comerciales,
 *     Verificación, etc. sin perderse en el chrome de comercial.
 */
export default async function SalesLayout({
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

  const isDirector = profile?.role === "office_director";
  const groups = isDirector ? OFFICE_DIRECTOR_SIDEBAR_GROUPS : SALES_SIDEBAR_GROUPS;
  const tabs = isDirector ? DIRECTOR_MOBILE_TABS : SALES_MOBILE_TABS;
  const brand: Brand = profile?.locations?.brand ?? DEFAULT_BRAND;
  const brandLabel = getBrandLabel(brand);
  const subtitle = isDirector ? `Director · ${brandLabel}` : `Comercial · ${brandLabel}`;
  const fallbackName = isDirector ? "Director de oficina" : "Comercial";

  return (
    <Frame>
      {/* Sidebar desktop: visible ≥768px, oculto en mobile (CSS) */}
      <div className="m-hide-mobile" style={{ display: "contents" }}>
        <Sidebar
          groups={groups}
          user={{
            name: profile?.full_name ?? fallbackName,
            subtitle,
            avatarUrl: profile?.avatar_url,
          }}
          supportUnread={supportUnread}
        />
      </div>
      <main
        className="m-main"
        style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        {children}
      </main>
      {/* Chrome mobile: oculto en desktop (CSS), fixed en mobile */}
      <div className="m-hide-desktop">
        <MobileProfileAvatar
          name={profile?.full_name ?? fallbackName}
          avatarUrl={profile?.avatar_url ?? null}
        />
        <MobileTabBar tabs={tabs} />
      </div>
    </Frame>
  );
}
