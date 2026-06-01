import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_BRAND } from "@/lib/branding";
import type { SavedTemplates } from "@/lib/messaging";
import type { Brand } from "@/lib/supabase/types";
import { MyTemplatesEditor } from "./MyTemplatesEditor";

export const dynamic = "force-dynamic";

type SalesProfile = {
  message_templates: SavedTemplates;
  locations: { brand: Brand } | null;
};

export default async function PlantillasPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Mis plantillas"
          subtitle="Modo demo — sin base de datos"
          breadcrumb="Mi panel"
          breadcrumbHref="/panel"
          range={null}
        />
        <div style={{ padding: "24px 32px" }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para editar tus plantillas.
            </div>
          </Card>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profileRes = await supabase
    .from("profiles")
    .select("message_templates, locations:locations(brand)")
    .eq("id", user.id)
    .maybeSingle<SalesProfile>();

  if (!profileRes.data) redirect("/panel");
  const profile = profileRes.data;
  const brand: Brand = profile.locations?.brand ?? DEFAULT_BRAND;

  return (
    <>
      <Topbar
        title="Mis plantillas"
        subtitle="Personaliza los mensajes que envías a tus clientes"
        breadcrumb="Mi panel"
        breadcrumbHref="/panel"
        range={null}
        compact
        right={
          <Link
            href="/clientes"
            className="m-hide-mobile"
            style={{
              padding: "7px 12px",
              border: "1px solid var(--line-strong)",
              borderRadius: 9,
              fontSize: 13,
              color: "var(--ink-2)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Mis clientes →
          </Link>
        }
      />

      <div
        className="m-page-pad"
        style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}
      >
        <Card padding={24}>
          <MyTemplatesEditor brand={brand} saved={profile.message_templates} />
        </Card>
      </div>
    </>
  );
}
