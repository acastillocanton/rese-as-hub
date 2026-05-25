import { Frame } from "@/components/layout/Frame";
import { Sidebar, SALES_SIDEBAR_GROUPS } from "@/components/layout/Sidebar";
import { MobileTabBar, SALES_MOBILE_TABS } from "@/components/layout/MobileTabBar";
import { MobileProfileAvatar } from "@/components/layout/MobileProfileAvatar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile: { full_name: string; avatar_url: string | null } | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const res = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle<{ full_name: string; avatar_url: string | null }>();
      profile = res.data;
    }
  }

  return (
    <Frame>
      {/* Sidebar desktop: visible ≥768px, oculto en mobile (CSS) */}
      <div className="m-hide-mobile" style={{ display: "contents" }}>
        <Sidebar
          groups={SALES_SIDEBAR_GROUPS}
          user={{
            name: profile?.full_name ?? "Comercial",
            subtitle: "Comercial",
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
      {/* Chrome mobile: oculto en desktop (CSS), fixed en mobile */}
      <div className="m-hide-desktop">
        <MobileProfileAvatar
          name={profile?.full_name ?? "Comercial"}
          avatarUrl={profile?.avatar_url ?? null}
        />
        <MobileTabBar tabs={SALES_MOBILE_TABS} />
      </div>
    </Frame>
  );
}
