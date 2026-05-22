import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LinkArsenalBlock } from "./LinkArsenalBlock";

type SalesProfile = {
  id: string;
  full_name: string;
  slug: string;
};

export default async function EnlacePage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Mi enlace"
          subtitle="Modo demo — sin base de datos"
          breadcrumb="Mi panel"
          range={null}
        />
        <div style={{ padding: "24px 32px" }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para ver tu enlace personal real.
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
    .select("id, full_name, slug")
    .eq("id", user.id)
    .maybeSingle<SalesProfile>();

  if (!profileRes.data) redirect("/panel");
  const profile = profileRes.data;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Stats del enlace GENÉRICO (sin client_id, las visitas al QR del mostrador).
  // Separamos de las visitas con sub-cliente porque la atribución funciona
  // distinta — el comercial necesita saber el peso del genérico vs personalizado.
  const [genericTotalRes, genericMonthRes, genericLastRes, personalizedMonthRes] =
    await Promise.all([
      supabase
        .from("share_links")
        .select("id", { count: "exact", head: true })
        .eq("sales_id", user.id)
        .is("client_id", null),
      supabase
        .from("share_links")
        .select("id", { count: "exact", head: true })
        .eq("sales_id", user.id)
        .is("client_id", null)
        .gte("opened_at", monthStart),
      supabase
        .from("share_links")
        .select("opened_at")
        .eq("sales_id", user.id)
        .is("client_id", null)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ opened_at: string }>(),
      supabase
        .from("share_links")
        .select("id", { count: "exact", head: true })
        .eq("sales_id", user.id)
        .not("client_id", "is", null)
        .gte("opened_at", monthStart),
    ]);

  const genericTotal = genericTotalRes.count ?? 0;
  const genericMonth = genericMonthRes.count ?? 0;
  const personalizedMonth = personalizedMonthRes.count ?? 0;
  const lastVisit = genericLastRes.data?.opened_at ?? null;

  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://resenahub.es";
  const fullUrl = `${appBase}/c/${profile.slug}`;
  const displayUrl = fullUrl.replace(/^https?:\/\//, "");

  const fmtRelative = (iso: string): string => {
    const d = new Date(iso);
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    if (diffMin < 1) return "hace unos segundos";
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH} h`;
    const diffDays = Math.floor(diffH / 24);
    if (diffDays < 7) return `hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  };

  return (
    <>
      <Topbar
        title="Mi enlace"
        subtitle="Tu enlace personal y herramientas para compartirlo"
        breadcrumb="Mi panel"
        range={null}
        compact
        right={
          <Link
            href="/panel"
            className="sales-hide-mobile"
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
            ← Mi panel
          </Link>
        }
      />

      <div
        className="sales-page-pad"
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* Stats del enlace genérico */}
        <div
          className="sales-stats-3"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          <Stat
            label="Visitas este mes (QR genérico)"
            value={genericMonth.toString()}
            sub={
              lastVisit
                ? `Última ${fmtRelative(lastVisit)}`
                : "Aún sin visitas — comparte el enlace"
            }
          />
          <Stat
            label="Visitas totales (QR genérico)"
            value={genericTotal.toString()}
            sub="Histórico completo"
          />
          <Stat
            label="Visitas por cliente (este mes)"
            value={personalizedMonth.toString()}
            sub={
              personalizedMonth === 0
                ? "Crea enlaces en Mis clientes"
                : "Enlaces personalizados"
            }
          />
        </div>

        {/* Arsenal */}
        <Card padding={24}>
          <LinkArsenalBlock
            fullUrl={fullUrl}
            displayUrl={displayUrl}
            salesName={profile.full_name}
            salesSlug={profile.slug}
          />
        </Card>

        {/* Tips */}
        <Card padding={24}>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 12,
              fontWeight: 600,
            }}
          >
            Cómo sacarle partido
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <TipRow
              n={1}
              title="Imprime el QR y ponlo donde te vean"
              body="Mostrador, hall de la oficina, tarjetas de visita, displays físicos. Pulsa “Descargar PNG” para imprenta."
            />
            <TipRow
              n={2}
              title="Pega el link en tu firma de email"
              body="Cada email que mandes lleva una invitación silenciosa a dejar reseña. Sin esfuerzo extra."
            />
            <TipRow
              n={3}
              title="Crea enlaces personalizados por cliente"
              body="Cuando vayas a pedirle reseña a alguien concreto, da de alta su nombre en Mis clientes. El enlace personalizado mejora la atribución automática a tu nombre."
            />
            <TipRow
              n={4}
              title="Adapta el mensaje al contexto"
              body="La plantilla de arriba es un punto de partida. Si lo mandas por WhatsApp a alguien conocido, hazlo más cercano. Para email formal, más sobrio."
            />
          </div>
        </Card>
      </div>
    </>
  );
}

function TipRow({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          color: "var(--ink-2)",
          display: "grid",
          placeItems: "center",
          fontSize: 13,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {n}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</div>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {body}
        </p>
      </div>
    </div>
  );
}
