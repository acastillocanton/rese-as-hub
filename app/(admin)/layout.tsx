import { Frame } from "@/components/layout/Frame";
import { Sidebar, ADMIN_SIDEBAR_GROUPS } from "@/components/layout/Sidebar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile: { full_name: string } | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const res = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle<{ full_name: string }>();
      profile = res.data;
    }
  }

  return (
    <Frame>
      <Sidebar
        groups={ADMIN_SIDEBAR_GROUPS}
        user={{
          name: profile?.full_name ?? "Administrador",
          subtitle: "Admin · Inseryal",
        }}
      />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {children}
      </main>
    </Frame>
  );
}
