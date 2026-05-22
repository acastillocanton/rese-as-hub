import { Frame } from "@/components/layout/Frame";
import { Sidebar, SALES_SIDEBAR_GROUPS } from "@/components/layout/Sidebar";
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
      <Sidebar
        groups={SALES_SIDEBAR_GROUPS}
        user={{
          name: profile?.full_name ?? "Comercial",
          subtitle: "Comercial",
          avatarUrl: profile?.avatar_url,
        }}
      />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {children}
      </main>
    </Frame>
  );
}
