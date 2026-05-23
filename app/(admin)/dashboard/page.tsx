import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { Progress } from "@/components/ui/Progress";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Pill";
import { Sparkline } from "@/components/charts/Sparkline";
import { AreaChart } from "@/components/charts/AreaChart";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProfileStatus, OauthStatus } from "@/lib/supabase/types";
import { MONTHS } from "@/lib/demo-data";
import {
  parseRange,
  defaultShortcuts,
  isFullNaturalMonth,
} from "@/lib/date-range";
import { RangePicker } from "@/components/ui/RangePicker";

// Dashboard recalcula rango y proyecciones con `new Date()`. Dinámico.
export const dynamic = "force-dynamic";

type SalesProfile = {
  id: string;
  full_name: string;
  slug: string;
  status: ProfileStatus;
  monthly_goal: number;
  location_id: string | null;
};

type LocationRow = {
  id: string;
  name: string;
  oauth_status: OauthStatus;
  google_place_id: string | null;
};

type ShareLinkRow = {
  id: string;
  sales_id: string;
  client_id: string | null;
  location_id: string;
  opened_at: string;
};

type RecentShareLinkRow = {
  id: string;
  opened_at: string;
  source: string;
  client: { full_name: string } | null;
  sales: { full_name: string; slug: string } | null;
  location: { name: string } | null;
};

type ReviewLite = {
  rating: number;
  match_state: string;
  sales_id: string | null;
  location_id: string;
  google_created_at: string;
};

function startOfMonthsAgoIso(n: number, d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() - n, 1).toISOString();
}

/** Bucketea ISO timestamps por mes (yyyy-mm) y devuelve un array alineado a `monthsBack` posiciones. */
function bucketByMonth(timestamps: string[], monthsBack: number, now = new Date()): number[] {
  const buckets = new Array<number>(monthsBack).fill(0);
  const baseY = now.getFullYear();
  const baseM = now.getMonth();
  for (const t of timestamps) {
    const d = new Date(t);
    const monthsAgo = (baseY - d.getFullYear()) * 12 + (baseM - d.getMonth());
    if (monthsAgo >= 0 && monthsAgo < monthsBack) {
      const idx = monthsBack - 1 - monthsAgo;
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
  }
  return buckets;
}

type DashboardSearchParams = Promise<{ from?: string; to?: string }>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: DashboardSearchParams;
}) {
  if (!isSupabaseConfigured()) {
    return <DemoFallback />;
  }

  const params = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const range = parseRange(params.from, params.to, now);
  const isMonthRange = isFullNaturalMonth(range);
  const start6Months = startOfMonthsAgoIso(5, now); // 6 buckets incluyendo el actual
  const shortcuts = defaultShortcuts(now);

  const [
    salesRes,
    locationsRes,
    sharesMonthRes,
    sharesHistoryRes,
    recentSharesRes,
    clientsCountRes,
    reviewsMonthRes,
    reviewsHistoryRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, slug, status, monthly_goal, location_id")
      .eq("role", "sales")
      .returns<SalesProfile[]>(),
    supabase
      .from("locations")
      .select("id, name, oauth_status, google_place_id")
      .order("name")
      .returns<LocationRow[]>(),
    supabase
      .from("share_links")
      .select("id, sales_id, client_id, location_id, opened_at")
      .gte("opened_at", range.startIso)
      .lt("opened_at", range.endIso)
      .returns<ShareLinkRow[]>(),
    supabase
      .from("share_links")
      .select("opened_at")
      .gte("opened_at", start6Months)
      .returns<{ opened_at: string }[]>(),
    supabase
      .from("share_links")
      .select(
        "id, opened_at, source, client:clients(full_name), sales:profiles!share_links_sales_id_fkey(full_name, slug), location:locations(name)",
      )
      .order("opened_at", { ascending: false })
      .limit(8)
      .returns<RecentShareLinkRow[]>(),
    // count: planned usa pg_stats — aprox pero rápido. Aceptable en un KPI
    // total de clientes sin comparar contra objetivo.
    supabase.from("clients").select("id", { count: "planned", head: true }),
    supabase
      .from("reviews")
      .select("rating, match_state, sales_id, location_id, google_created_at")
      .is("removed_at", null)
      .gte("google_created_at", range.startIso)
      .lt("google_created_at", range.endIso)
      .returns<ReviewLite[]>(),
    supabase
      .from("reviews")
      .select("google_created_at")
      .is("removed_at", null)
      .gte("google_created_at", start6Months)
      .returns<{ google_created_at: string }[]>(),
  ]);

  const sales = salesRes.data ?? [];
  const locations = locationsRes.data ?? [];
  const sharesMonth = sharesMonthRes.data ?? [];
  const sharesHistory = sharesHistoryRes.data ?? [];
  const recentShares = recentSharesRes.data ?? [];
  const totalClients = clientsCountRes.count ?? 0;
  const reviewsMonth = reviewsMonthRes.data ?? [];
  const reviewsHistory = reviewsHistoryRes.data ?? [];

  // ─── KPIs ────────────────────────────────────────────────────────────────
  const visitsInRange = sharesMonth.length;
  const activeSales = sales.filter((s) => s.status === "active").length;
  const invitedSales = sales.filter((s) => s.status === "invited").length;
  const pausedSales = sales.filter((s) => s.status === "paused").length;
  // Una ficha está "sincronizando" si tiene cualquiera de estas dos vías
  // activas: Business Profile API vía OAuth, o Places API vía place_id.
  // Mientras esperamos la cuota de BP, todas sincronizan por Places.
  const syncingLocations = locations.filter(
    (l) => l.oauth_status === "connected" || l.google_place_id !== null,
  ).length;
  const offlineLocations = locations.length - syncingLocations;
  // Sub-conteo informativo: cuántas están en BP vs solo Places.
  const businessProfileLocations = locations.filter(
    (l) => l.oauth_status === "connected",
  ).length;
  const reviewsCount = reviewsMonth.length;
  const pendingReviews = reviewsMonth.filter((r) => r.match_state === "pending").length;
  const avgRating =
    reviewsMonth.length > 0
      ? reviewsMonth.reduce((sum, r) => sum + r.rating, 0) / reviewsMonth.length
      : null;

  // ─── Chart histórico (6 meses) ───────────────────────────────────────────
  const sharesByMonth = bucketByMonth(
    sharesHistory.map((s) => s.opened_at),
    6,
    now,
  );
  const reviewsByMonth = bucketByMonth(
    reviewsHistory.map((r) => r.google_created_at),
    6,
    now,
  );
  const monthLabels: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthLabels.push(MONTHS[d.getMonth()] ?? "");
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────
  const sharesBySales = new Map<string, number>();
  for (const s of sharesMonth) {
    sharesBySales.set(s.sales_id, (sharesBySales.get(s.sales_id) ?? 0) + 1);
  }
  const reviewsBySales = new Map<string, number>();
  const reviewsCountedBySales = new Map<string, number>();
  for (const r of reviewsMonth) {
    if (!r.sales_id) continue;
    reviewsBySales.set(r.sales_id, (reviewsBySales.get(r.sales_id) ?? 0) + 1);
    if (r.match_state === "counted") {
      reviewsCountedBySales.set(
        r.sales_id,
        (reviewsCountedBySales.get(r.sales_id) ?? 0) + 1,
      );
    }
  }
  const leaderboard = sales
    .map((s) => {
      const location = locations.find((l) => l.id === s.location_id);
      const visits = sharesBySales.get(s.id) ?? 0;
      const reviews = reviewsBySales.get(s.id) ?? 0;
      const counted = reviewsCountedBySales.get(s.id) ?? 0;
      const conv = visits > 0 ? Math.round((reviews / visits) * 100) : 0;
      return {
        id: s.id,
        slug: s.slug,
        name: s.full_name,
        status: s.status,
        branch: location?.name ?? "—",
        visits,
        reviews,
        counted,
        conv,
        goal: s.monthly_goal,
      };
    })
    .sort((a, b) => b.reviews - a.reviews || b.visits - a.visits);

  // ─── Branches breakdown ──────────────────────────────────────────────────
  const visitsByLocation = new Map<string, number>();
  for (const s of sharesMonth) {
    visitsByLocation.set(s.location_id, (visitsByLocation.get(s.location_id) ?? 0) + 1);
  }
  const reviewsByLocation = new Map<string, number>();
  for (const r of reviewsMonth) {
    reviewsByLocation.set(r.location_id, (reviewsByLocation.get(r.location_id) ?? 0) + 1);
  }
  const salesByLocation = new Map<string, number>();
  for (const s of sales) {
    if (s.location_id) {
      salesByLocation.set(s.location_id, (salesByLocation.get(s.location_id) ?? 0) + 1);
    }
  }
  const branches = locations.map((l) => {
    const hasPlaceId = l.google_place_id !== null;
    const isBpConnected = l.oauth_status === "connected";
    const isBpError = l.oauth_status === "error";
    // Estado consolidado de sincronización:
    //   "bp"     → Business Profile activo (mejor caso, paginable)
    //   "places" → solo Places API (la situación actual mientras esperamos BP)
    //   "error"  → BP en error y sin Place ID de respaldo
    //   "none"   → sin ninguna vía
    const syncStatus: "bp" | "places" | "error" | "none" = isBpConnected
      ? "bp"
      : hasPlaceId
        ? "places"
        : isBpError
          ? "error"
          : "none";
    return {
      id: l.id,
      name: l.name,
      syncStatus,
      visits: visitsByLocation.get(l.id) ?? 0,
      reviews: reviewsByLocation.get(l.id) ?? 0,
      salesAssigned: salesByLocation.get(l.id) ?? 0,
    };
  });

  // ─── Meta de equipo ──────────────────────────────────────────────────────
  // El objetivo es mensual: si el rango no cubre exactamente un mes natural,
  // mantenemos la suma pero avisamos al lado del título.
  const teamGoal = sales.reduce((sum, s) => sum + s.monthly_goal, 0);
  const teamCounted = leaderboard.reduce((sum, s) => sum + s.counted, 0);
  const teamProgress = teamGoal > 0 ? Math.round((teamCounted / teamGoal) * 100) : 0;
  const rangeLabel = range.label;

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Dashboard general"
        range={null}
        breadcrumb="Inseryal"
        right={
          <RangePicker
            from={range.from}
            to={range.to}
            label={range.label}
            shortcuts={shortcuts}
          />
        }
      />

      <div style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
        {/* KPI row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
          }}
        >
          <Stat
            label="Visitas a enlaces"
            value={visitsInRange.toString()}
            sub={rangeLabel}
          />
          <Stat
            label="Comerciales activos"
            value={activeSales.toString()}
            sub={
              invitedSales > 0 || pausedSales > 0
                ? `${invitedSales} invitado${invitedSales === 1 ? "" : "s"} · ${pausedSales} pausado${pausedSales === 1 ? "" : "s"}`
                : "Toda la plantilla operativa"
            }
          />
          <Stat
            label="Fichas sincronizando"
            value={`${syncingLocations}/${locations.length}`}
            sub={
              syncingLocations === 0
                ? "Ninguna con Place ID configurado"
                : businessProfileLocations === locations.length
                  ? "Todas vía Business Profile"
                  : businessProfileLocations === 0
                    ? "Vía Places API"
                    : `${businessProfileLocations} BP · ${syncingLocations - businessProfileLocations} Places`
            }
            deltaTone={syncingLocations === 0 ? "warn" : "ok"}
          />
          <Stat
            label="Reseñas verificadas"
            value={reviewsCount.toString()}
            sub={
              reviewsCount === 0
                ? "Pendiente aprobación Google API"
                : `${pendingReviews} por verificar · ${avgRating?.toFixed(2).replace(".", ",") ?? "—"} ★`
            }
            deltaTone={reviewsCount === 0 ? "neutral" : "ok"}
          />
        </div>

        {/* Chart + goals */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.85fr 1fr",
            gap: 16,
            marginTop: 16,
          }}
        >
          <Card>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 6,
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                  Evolución temporal
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    marginTop: 4,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Visitas a enlaces vs. reseñas verificadas
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  fontSize: 12,
                  color: "var(--ink-3)",
                  alignItems: "center",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 14,
                      height: 0,
                      borderTop: "1.5px dashed #AEAEB2",
                    }}
                  />
                  Visitas
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 14,
                      height: 0,
                      borderTop: "1.5px solid #1D1D1F",
                    }}
                  />
                  Reseñas
                </span>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <AreaChart
                enviados={sharesByMonth}
                conseguidos={reviewsByMonth}
                labels={monthLabels}
                height={230}
              />
            </div>
          </Card>

          <Card>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                  Objetivos · {rangeLabel}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    marginTop: 4,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Equipo en conjunto
                </div>
                {!isMonthRange && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11.5,
                      color: "var(--ink-4)",
                      fontStyle: "italic",
                    }}
                  >
                    Los objetivos son mensuales — selecciona un mes natural para verlos al 100%.
                  </div>
                )}
              </div>
              <Pill
                tone={
                  teamProgress >= 80 ? "ok" : teamProgress >= 40 ? "neutral" : "warn"
                }
                withDot
              >
                {teamProgress >= 80 ? "En ritmo" : teamProgress >= 40 ? "A medio camino" : "Arrancando"}
              </Pill>
            </div>

            <GoalRow
              label="Reseñas verificadas"
              value={`${teamCounted} / ${teamGoal}`}
              hint={
                teamGoal === 0
                  ? "Sin meta definida"
                  : reviewsCount === 0
                    ? "Aún sin reseñas — Google API pendiente"
                    : `${teamProgress}% de la meta`
              }
              current={teamCounted}
              max={teamGoal || 1}
              tone={teamProgress >= 100 ? "ok" : "ink"}
            />
            <GoalRow
              label="Visitas registradas"
              value={`${visitsInRange}`}
              hint={
                visitsInRange === 0
                  ? "Aún sin actividad"
                  : `${totalClients} cliente${totalClients === 1 ? "" : "s"} en el sistema`
              }
              current={Math.min(visitsInRange, 100)}
              max={100}
              tone="ink"
            />
            <GoalRow
              label="Fichas sincronizando"
              value={`${syncingLocations} / ${locations.length}`}
              hint={
                syncingLocations === 0
                  ? "Sin Place ID ni OAuth"
                  : syncingLocations === locations.length
                    ? businessProfileLocations === locations.length
                      ? "Todas vía Business Profile"
                      : businessProfileLocations === 0
                        ? "Todas vía Places API"
                        : `${businessProfileLocations} BP · ${syncingLocations - businessProfileLocations} Places`
                  : `${offlineLocations} sin vía activa`
              }
              current={syncingLocations}
              max={locations.length || 1}
              tone={syncingLocations === locations.length ? "ok" : "ink"}
            />
          </Card>
        </div>

        {/* Leaderboard + Recent visits */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 16,
            marginTop: 16,
          }}
        >
          <Card padding={0}>
            <div
              style={{
                padding: "18px 22px 12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                  Ranking
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    marginTop: 4,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Leaderboard del mes
                </div>
              </div>
              {leaderboard.length === 0 && (
                <Pill tone="neutral" withDot>
                  Sin comerciales
                </Pill>
              )}
            </div>

            {leaderboard.length === 0 ? (
              <div style={{ padding: "18px 22px 22px" }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "var(--ink-3)",
                    lineHeight: 1.55,
                  }}
                >
                  Aún no hay comerciales dados de alta. Invítales desde{" "}
                  <Link href="/comerciales" style={{ color: "var(--ink)" }}>
                    Comerciales
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div style={{ padding: "4px 22px 14px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1.6fr 1fr 0.7fr 0.7fr 0.7fr 100px",
                    gap: 14,
                    padding: "8px 0",
                    fontSize: 11,
                    color: "var(--ink-4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span>#</span>
                  <span>Comercial</span>
                  <span>Ficha</span>
                  <span style={{ textAlign: "right" }}>Visitas</span>
                  <span style={{ textAlign: "right" }}>Reseñas</span>
                  <span style={{ textAlign: "right" }}>Conv.</span>
                  <span style={{ textAlign: "right" }}>Tendencia</span>
                </div>
                {leaderboard.map((p, i) => (
                  <Link
                    key={p.id}
                    href={`/comerciales/${p.slug}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1.6fr 1fr 0.7fr 0.7fr 0.7fr 100px",
                      gap: 14,
                      padding: "12px 0",
                      alignItems: "center",
                      borderBottom:
                        i === leaderboard.length - 1 ? "none" : "1px solid var(--line)",
                      fontSize: 13.5,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <span
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        color: i < 3 ? "var(--ink)" : "var(--ink-4)",
                        fontWeight: i < 3 ? 600 : 500,
                      }}
                    >
                      {(i + 1).toString().padStart(2, "0")}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Avatar name={p.name} size={28} />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            letterSpacing: "-0.005em",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.name}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                          {p.status === "active"
                            ? "Activo"
                            : p.status === "paused"
                              ? "Pausado"
                              : "Invitado"}
                          {" · meta "}
                          {p.goal}
                        </div>
                      </div>
                    </div>
                    <span style={{ color: "var(--ink-3)", fontSize: 12.5 }}>{p.branch}</span>
                    <span
                      style={{
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: p.visits > 0 ? "var(--ink)" : "var(--ink-4)",
                      }}
                    >
                      {p.visits}
                    </span>
                    <span
                      style={{
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 600,
                        color: p.reviews > 0 ? "var(--ink)" : "var(--ink-4)",
                      }}
                    >
                      {p.reviews}
                    </span>
                    <span
                      style={{
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--ink-3)",
                      }}
                    >
                      {p.visits > 0 ? `${p.conv}%` : "—"}
                    </span>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <Sparkline
                        data={[0, 0, 0, 0, 0, p.visits]}
                        width={84}
                        height={22}
                        stroke={p.visits > 0 ? "var(--ink-2)" : "#D6D6D9"}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card padding={0}>
            <div
              style={{
                padding: "18px 22px 12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                  Actividad
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    marginTop: 4,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Visitas recientes a enlaces
                </div>
              </div>
              <Pill withDot>en vivo</Pill>
            </div>
            <div style={{ padding: "0 22px 12px" }}>
              {recentShares.length === 0 ? (
                <p
                  style={{
                    margin: "12px 0",
                    fontSize: 13,
                    color: "var(--ink-3)",
                    lineHeight: 1.55,
                  }}
                >
                  Aún no se ha registrado ninguna visita a un enlace de comercial.
                  Cuando un cliente abra una URL{" "}
                  <code
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--ink-2)",
                    }}
                  >
                    /c/[comercial]/[cliente]
                  </code>{" "}
                  aparecerá aquí.
                </p>
              ) : (
                recentShares.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      padding: "14px 0",
                      borderTop: "1px solid var(--line)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar
                        name={s.client?.full_name ?? s.sales?.full_name ?? "?"}
                        size={26}
                      />
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                            {s.client?.full_name ?? "Cliente sin registrar"}
                          </span>
                          <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                            {fmtDateTime(s.opened_at)}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--ink-4)",
                            marginTop: 2,
                          }}
                        >
                          {s.sales?.full_name ? `Comercial · ${s.sales.full_name}` : "Sin comercial"}
                          {s.location?.name ? ` · ${s.location.name}` : ""}
                          {" · "}
                          <span style={{ textTransform: "capitalize" }}>{s.source}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Branches breakdown */}
        <div style={{ marginTop: 16 }}>
          <Card>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                  Fichas Google
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    marginTop: 4,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Rendimiento por ficha
                </div>
              </div>
              <Link
                href="/fichas"
                style={{
                  fontSize: 12.5,
                  color: "var(--ink-3)",
                  textDecoration: "none",
                  padding: "6px 10px",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 8,
                }}
              >
                Gestionar fichas →
              </Link>
            </div>
            {branches.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "var(--ink-3)",
                  lineHeight: 1.55,
                }}
              >
                Aún no has dado de alta ninguna ficha de Google Business.{" "}
                <Link href="/fichas" style={{ color: "var(--ink)" }}>
                  Crear la primera
                </Link>
                .
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 16,
                }}
              >
                {branches.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      padding: "12px 14px",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--surface-2)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "var(--ink-2)",
                          fontWeight: 500,
                        }}
                      >
                        {b.name}
                      </div>
                      <Pill
                        tone={
                          b.syncStatus === "bp" || b.syncStatus === "places"
                            ? "ok"
                            : b.syncStatus === "error"
                              ? "warn"
                              : "neutral"
                        }
                        withDot
                      >
                        {b.syncStatus === "bp"
                          ? "Business Profile"
                          : b.syncStatus === "places"
                            ? "Places API"
                            : b.syncStatus === "error"
                              ? "Error OAuth"
                              : "Sin Place ID"}
                      </Pill>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 24,
                          fontWeight: 600,
                          letterSpacing: "-0.02em",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {b.visits}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--ink-4)" }}>visitas</span>
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11.5,
                        color: "var(--ink-4)",
                      }}
                    >
                      <span>
                        {b.salesAssigned} comercial{b.salesAssigned === 1 ? "" : "es"}
                      </span>
                      <span>
                        {b.reviews} reseña{b.reviews === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function GoalRow({
  label,
  value,
  hint,
  current,
  max,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint: string;
  current: number;
  max: number;
  tone?: "ink" | "ok";
}) {
  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{label}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        <Progress value={current} max={max} tone={tone} />
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 11.5,
          color: tone === "ok" ? "var(--ok)" : "var(--ink-4)",
        }}
      >
        {hint}
      </div>
    </div>
  );
}

// ─── Fallback modo demo ────────────────────────────────────────────────────

async function DemoFallback() {
  // Mantenemos los datos demo originales para que el repo se pueda navegar sin
  // Supabase configurado. Lo importamos perezosamente para no cargar este peso
  // en el modo real.
  const { TEAM, RECENT, SERIES_SENT, SERIES_VERIFIED, BRANCHES } = await import(
    "@/lib/demo-data"
  );
  const { Stars } = await import("@/components/ui/Stars");

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Modo demo · sin Supabase"
        range="Datos de ejemplo"
        breadcrumb="Inseryal"
        right={<GhostBtn primary>Invitar comercial</GhostBtn>}
      />
      <div style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
        <Card>
          <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
            Modo demostración
          </div>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13,
              color: "var(--ink-3)",
              lineHeight: 1.55,
              maxWidth: 640,
            }}
          >
            No hay credenciales de Supabase configuradas. Configura{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>.env.local</code> con tus
            claves para ver datos reales. Más abajo se muestran datos de ejemplo solo
            para navegar la interfaz.
          </p>
        </Card>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginTop: 16,
          }}
        >
          <Stat label="Reseñas totales" value="459" sub="vs 387 el mes pasado" delta="+18,6%" />
          <Stat label="Conversión" value="78,4%" sub="585 enlaces · 459 reseñas" delta="+4,1 pp" />
          <Stat label="Valoración media" value="4,82" sub="sobre 5" delta="+0,07" />
          <Stat label="Pendientes" value="14" sub="por verificar" delta="−6" />
        </div>
        <div style={{ marginTop: 16 }}>
          <Card>
            <AreaChart
              enviados={SERIES_SENT}
              conseguidos={SERIES_VERIFIED}
              labels={MONTHS}
              height={200}
            />
          </Card>
        </div>
        <div style={{ marginTop: 16 }}>
          <Card padding={0}>
            <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)" }}>
              <strong>Leaderboard (demo)</strong>
            </div>
            {TEAM.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "10px 22px",
                  borderTop: "1px solid var(--line)",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13.5,
                }}
              >
                <span>{p.name}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {p.reviews} reseñas · {p.avg.toString().replace(".", ",")} ★
                </span>
              </div>
            ))}
          </Card>
        </div>
        <div style={{ marginTop: 16 }}>
          <Card padding={0}>
            <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)" }}>
              <strong>Reseñas recientes (demo)</strong>
            </div>
            {RECENT.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: "12px 22px",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <strong>{r.name}</strong>
                  <Stars value={r.stars} />
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
                  {r.text}
                </p>
              </div>
            ))}
          </Card>
        </div>
        <div style={{ marginTop: 16 }}>
          <Card>
            <strong>Fichas (demo)</strong>
            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              {BRANCHES.map((b) => (
                <div
                  key={b.name}
                  style={{
                    padding: 12,
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{b.name}</div>
                  <div style={{ fontSize: 22, fontWeight: 600 }}>{b.reviews}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
