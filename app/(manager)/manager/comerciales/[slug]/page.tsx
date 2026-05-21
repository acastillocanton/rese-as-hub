import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Stars } from "@/components/ui/Stars";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProfileStatus } from "@/lib/supabase/types";

type PageProps = { params: Promise<{ slug: string }> };

type SalesDetail = {
  id: string;
  full_name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  monthly_goal: number;
  status: ProfileStatus;
  joined_at: string;
  location: { id: string; name: string } | null;
};

type ReviewRow = {
  id: string;
  author_name: string;
  rating: number;
  text: string | null;
  google_created_at: string;
  match_state: string;
  match_confidence: number;
  client_id: string | null;
  location: { name: string } | null;
};

export default async function ManagerComercialDetallePage({ params }: PageProps) {
  const { slug } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Detalle"
          subtitle="Modo demo · sin base de datos"
          breadcrumb="Comerciales"
        />
        <div style={{ padding: "24px 32px" }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para ver detalle real del comercial.
            </div>
          </Card>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const { data: sales } = await supabase
    .from("profiles")
    .select(
      "id, full_name, slug, email, phone, monthly_goal, status, joined_at, location:locations(id, name)",
    )
    .eq("slug", slug)
    .eq("role", "sales")
    .maybeSingle<SalesDetail>();
  if (!sales) notFound();

  const [clientsRes, sharesRes, reviewsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name, slug, created_at")
      .eq("sales_id", sales.id)
      .order("created_at", { ascending: false })
      .returns<
        { id: string; full_name: string; slug: string; created_at: string }[]
      >(),
    supabase
      .from("share_links")
      .select("client_id, opened_at")
      .eq("sales_id", sales.id)
      .returns<{ client_id: string | null; opened_at: string }[]>(),
    supabase
      .from("reviews")
      .select(
        "id, author_name, rating, text, google_created_at, match_state, match_confidence, client_id, location:locations(name)",
      )
      .eq("sales_id", sales.id)
      .order("google_created_at", { ascending: false })
      .returns<ReviewRow[]>(),
  ]);

  const clients = clientsRes.data ?? [];
  const shares = sharesRes.data ?? [];
  const reviews = reviewsRes.data ?? [];

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const reviewsThisMonth = reviews.filter((r) => r.google_created_at >= startOfMonth);
  const totalVisits = shares.length;
  const lastVisitISO =
    shares.length > 0
      ? shares.reduce(
          (max, s) => (s.opened_at > max ? s.opened_at : max),
          shares[0].opened_at,
        )
      : null;
  const meta = sales.monthly_goal;
  const pct = meta > 0 ? Math.round((reviewsThisMonth.length / meta) * 100) : 0;

  const visitsByClient = new Map<string, number>();
  for (const s of shares) {
    if (!s.client_id) continue;
    visitsByClient.set(s.client_id, (visitsByClient.get(s.client_id) ?? 0) + 1);
  }
  const reviewsByClient = new Map<string, number>();
  for (const r of reviews) {
    if (!r.client_id) continue;
    reviewsByClient.set(r.client_id, (reviewsByClient.get(r.client_id) ?? 0) + 1);
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <>
      <Topbar
        title={sales.full_name}
        subtitle={`Comercial · ${sales.location?.name ?? "sin ficha"} · ${
          sales.status === "active"
            ? "Activo"
            : sales.status === "paused"
              ? "Pausado"
              : "Invitado"
        }`}
        breadcrumb="Comerciales"
        range=""
        right={
          <Link
            href="/manager/comerciales"
            style={{
              padding: "7px 12px",
              background: "transparent",
              border: "1px solid var(--line-strong)",
              borderRadius: 9,
              fontSize: 13,
              color: "var(--ink-2)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            ← Todos
          </Link>
        }
      />

      <div
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "4px 0 4px 4px",
          }}
        >
          <Avatar name={sales.full_name} size={56} />
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.02em",
              }}
            >
              {sales.full_name}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--ink-3)",
                fontFamily: "var(--font-mono)",
                marginTop: 2,
              }}
            >
              /c/{sales.slug}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1.2fr)",
            gap: 18,
          }}
        >
          <Card>
            <div style={sectionLabel}>Datos del comercial</div>
            <dl style={{ margin: "14px 0 0", display: "grid", rowGap: 12 }}>
              <DataRow label="Email" value={sales.email ?? "—"} />
              <DataRow label="Teléfono" value={sales.phone ?? "—"} />
              <DataRow label="Slug" mono value={`/c/${sales.slug}`} />
              <DataRow label="Ficha asignada" value={sales.location?.name ?? "—"} />
              <DataRow label="Meta mensual" value={`${meta} reseñas/mes`} />
              <DataRow
                label="Estado"
                customValue={
                  <Pill
                    tone={
                      sales.status === "active"
                        ? "ok"
                        : sales.status === "paused"
                          ? "warn"
                          : "neutral"
                    }
                    withDot
                  >
                    {sales.status === "active"
                      ? "Activo"
                      : sales.status === "paused"
                        ? "Pausado"
                        : "Invitado"}
                  </Pill>
                }
              />
              <DataRow label="Alta" value={fmtDate(sales.joined_at)} />
            </dl>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <Stat
              label="Reseñas del mes"
              value={`${reviewsThisMonth.length}/${meta}`}
              sub={reviewsThisMonth.length === 0 ? "Sin reseñas este mes" : `${pct}% de la meta`}
              deltaTone={pct >= 100 ? "ok" : pct >= 60 ? "neutral" : "warn"}
              delta={pct > 0 ? `${pct}%` : undefined}
            />
            <Stat
              label="Visitas al enlace"
              value={totalVisits.toString()}
              sub={lastVisitISO ? `Última · ${fmtDateTime(lastVisitISO)}` : "Sin visitas"}
            />
            <Stat
              label="Clientes registrados"
              value={clients.length.toString()}
              sub={
                clients.length === 0
                  ? "Sin clientes"
                  : `${clients.filter((c) => (visitsByClient.get(c.id) ?? 0) > 0).length} con visita`
              }
            />
            <Stat
              label="Reseñas totales"
              value={reviews.length.toString()}
              sub={
                reviews.length === 0
                  ? "Pendiente Google API"
                  : `${reviews.filter((r) => r.match_state === "counted").length} automáticas`
              }
            />
          </div>
        </div>

        <Card padding={0}>
          <div
            style={{
              padding: "14px 22px",
              borderBottom: "1px solid var(--line)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={sectionLabel}>Clientes registrados ({clients.length})</div>
            <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
              Los registra el propio comercial desde su panel
            </span>
          </div>

          {clients.length === 0 ? (
            <div style={{ padding: "28px 22px", fontSize: 13, color: "var(--ink-3)" }}>
              Aún sin clientes registrados.
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: "10px 22px",
                  borderBottom: "1px solid var(--line)",
                  display: "grid",
                  gridTemplateColumns: "2fr 0.8fr 0.8fr 1fr",
                  gap: 14,
                  fontSize: 11,
                  color: "var(--ink-4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                <span>Cliente</span>
                <span style={{ textAlign: "right" }}>Visitas</span>
                <span style={{ textAlign: "right" }}>Reseñas</span>
                <span>Alta</span>
              </div>
              {clients.map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    padding: "12px 22px",
                    borderBottom:
                      i === clients.length - 1 ? "none" : "1px solid var(--line)",
                    display: "grid",
                    gridTemplateColumns: "2fr 0.8fr 0.8fr 1fr",
                    gap: 14,
                    alignItems: "center",
                    fontSize: 13.5,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, letterSpacing: "-0.005em" }}>
                      {c.full_name}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--ink-4)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      /c/{sales.slug}/{c.slug}
                    </div>
                  </div>
                  <span
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: (visitsByClient.get(c.id) ?? 0) > 0 ? "var(--ink)" : "var(--ink-4)",
                    }}
                  >
                    {visitsByClient.get(c.id) ?? 0}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: (reviewsByClient.get(c.id) ?? 0) > 0 ? "var(--ink)" : "var(--ink-4)",
                    }}
                  >
                    {reviewsByClient.get(c.id) ?? 0}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
                    {fmtDate(c.created_at)}
                  </span>
                </div>
              ))}
            </>
          )}
        </Card>

        <Card>
          <div style={sectionLabel}>Reseñas atribuidas</div>
          {reviews.length === 0 ? (
            <div
              style={{
                marginTop: 14,
                padding: "20px 18px",
                border: "1px dashed var(--line-strong)",
                borderRadius: 10,
                background: "var(--surface-2)",
                fontSize: 13,
                color: "var(--ink-3)",
                lineHeight: 1.55,
              }}
            >
              Aún sin reseñas atribuidas a este comercial. Aparecerán aquí
              automáticamente cuando Google sincronice las reseñas de sus
              clientes (pendiente aprobación API).
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {reviews.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: "14px 16px",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    background: "var(--surface)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600, letterSpacing: "-0.005em" }}>
                      {r.author_name}
                    </div>
                    <Stars value={r.rating} />
                  </div>
                  {r.text && (
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13.5,
                        lineHeight: 1.55,
                        color: "var(--ink-2)",
                      }}
                    >
                      {r.text}
                    </p>
                  )}
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 12,
                      fontSize: 11.5,
                      color: "var(--ink-4)",
                    }}
                  >
                    <span>{fmtDate(r.google_created_at)}</span>
                    {r.location?.name && (
                      <>
                        <span>·</span>
                        <span>{r.location.name}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>
                      Match {r.match_state} · confianza {r.match_confidence}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--ink-4)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 600,
};

function DataRow({
  label,
  value,
  mono,
  customValue,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  customValue?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "130px 1fr",
        alignItems: "center",
        gap: 12,
      }}
    >
      <dt style={{ fontSize: 12, color: "var(--ink-4)" }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontSize: 13.5,
          color: "var(--ink)",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          wordBreak: mono ? "break-all" : "normal",
        }}
      >
        {customValue ?? value}
      </dd>
    </div>
  );
}
