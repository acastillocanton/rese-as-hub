import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { NewClientButton } from "./NewClientButton";
import { ClientRowItem } from "./ClientRowItem";
import type { ClientRow } from "./actions";

type SalesProfile = { full_name: string; slug: string };

const DEMO_PROFILE: SalesProfile = { full_name: "Mateo Salgado", slug: "mateo-salgado" };

export default async function ClientesPage() {
  let salesProfile: SalesProfile | null = null;
  let clients: ClientRow[] = [];
  let dbError: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const [profileRes, clientsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, slug")
          .eq("id", user.id)
          .maybeSingle<SalesProfile>(),
        supabase
          .from("clients")
          .select("id, full_name, slug, email, phone, created_at")
          .eq("sales_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      salesProfile = profileRes.data ?? null;
      if (clientsRes.error) {
        dbError = clientsRes.error.message;
      } else {
        clients = (clientsRes.data ?? []) as ClientRow[];
      }
    }
  } else {
    salesProfile = DEMO_PROFILE;
  }

  const profile = salesProfile ?? DEMO_PROFILE;
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://reseñahub.es";

  return (
    <>
      <Topbar
        title="Mis clientes"
        subtitle="Genera un enlace personalizado por visita"
        range={
          clients.length === 0
            ? ""
            : `${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}`
        }
        breadcrumb="Inseryal"
        compact
        right={
          <NewClientButton
            appBase={appBase}
            salesName={profile.full_name}
            salesSlug={profile.slug}
          />
        }
      />

      <div className="m-page-pad" style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
        {dbError ? (
          <Card>
            <div style={{ fontSize: 13, color: "var(--warn)", fontWeight: 500 }}>
              Error al cargar tus clientes
            </div>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 12.5,
                color: "var(--ink-3)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {dbError}
            </p>
          </Card>
        ) : clients.length === 0 ? (
          <Card padding={32}>
            <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
              Sin clientes todavía
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                marginTop: 4,
                letterSpacing: "-0.02em",
              }}
            >
              Da de alta a tu primer cliente
            </div>
            <p
              style={{
                margin: "10px 0 16px",
                color: "var(--ink-3)",
                fontSize: 13.5,
                lineHeight: 1.55,
                maxWidth: 560,
              }}
            >
              Cada cliente que registres tendrá su propio enlace{" "}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
                /c/{profile.slug}/nombre-cliente
              </span>
              . Eso nos deja atribuirte la reseña automáticamente cuando la deje en
              Google.
            </p>
            <NewClientButton
              appBase={appBase}
              salesName={profile.full_name}
              salesSlug={profile.slug}
            />
          </Card>
        ) : (
          <Card padding={0}>
            <div
              className="m-hide-mobile"
              style={{
                padding: "12px 22px",
                borderBottom: "1px solid var(--line)",
                display: "grid",
                gridTemplateColumns: "1.6fr 1.4fr 1fr 1fr 200px",
                gap: 14,
                fontSize: 11,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              <span>Cliente</span>
              <span>Email</span>
              <span>Teléfono</span>
              <span>Alta</span>
              <span></span>
            </div>
            {clients.map((c, i) => (
              <ClientRowItem
                key={c.id}
                client={c}
                last={i === clients.length - 1}
                appBase={appBase}
                salesName={profile.full_name}
                salesSlug={profile.slug}
              />
            ))}
          </Card>
        )}
      </div>
    </>
  );
}
