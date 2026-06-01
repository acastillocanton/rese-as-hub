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
  bucketByMonth,
} from "@/lib/date-range";
import { RangePicker } from "@/components/ui/RangePicker";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb } from "@/lib/branding";
import { computeLeaderboard } from "@/lib/leaderboard";
import { LeaderboardTable } from "@/components/ranking/LeaderboardTable";

// Dashboard recalcula rango y proyecciones con `new Date()`. Dinámico.
export const dynamic = "force-dynamic";

type SalesProfile = {
  id: string;
  full_name: string;
  slug: string;
  status: ProfileStatus;
  monthly_goal: number;
  location_id: string | null;
  /** "sales" o "office_director" — el director también produce y entra en
   *  el leaderboard. Lo usamos para etiquetar la fila con "★ Director". */
  role: "sales" | "office_director";
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
  id: string;
  rating: number;
  match_state: string;
  sales_id: string | null;
  location_id: string;
  google_created_at: string;
  author_name: string;
};

function startOfMonthsAgoIso(n: number, d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() - n, 1).toISOString();
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
  const brand = await getCurrentUserBrand();

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
      // Producers: sales + office_director. El director también vende y
      // entra en su propio leaderboard, junto con su equipo.
      .select("id, full_name, slug, status, monthly_goal, location_id, role")
      .in("role", ["sales", "office_director"])
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
      .select("id, rating, match_state, sales_id, location_id, google_created_at, author_name")
      .is("removed_at", null)
      .eq("is_duplicate", false)
      .gte("google_created_at", range.startIso)
      .lt("google_created_at", range.endIso)
      .limit(10000) // techo defensivo de KPIs del periodo (global, todas las fichas)
      .returns<ReviewLite[]>(),
    supabase
      .from("reviews")
      .select("google_created_at")
      .is("removed_at", null)
      .eq("is_duplicate", false)
      .gte("google_created_at", start6Months)
      .limit(20000) // techo del histórico de 6 meses para el gráfico de barras
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

  // Alertas ≤2★ del periodo: cap a 5 entradas en el banner, contador total
  // para el CTA. Se ordenan por google_created_at desc (más reciente arriba).
  const locationsById = new Map(locations.map((l) => [l.id, l]));
  const lowRatingReviewsAll = reviewsMonth
    .filter((r) => r.rating <= 2)
    .sort((a, b) => b.google_created_at.localeCompare(a.google_created_at));
  const lowRatingReviews = lowRatingReviewsAll.slice(0, 5);
  const lowRatingTotal = lowRatingReviewsAll.length;
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
  // El cálculo vive en lib/leaderboard.ts (compartido con /ranking). El
  // dashboard pinta solo los Top 10 — la lista completa de los 51 productores
  // en una card hace que el resumen pierda función. "Ver ranking completo"
  // enlaza a /ranking, que tiene la misma tabla sin slice.
  const leaderboard = computeLeaderboard({
    sales,
    locations,
    shares: sharesMonth,
    reviews: reviewsMonth,
  });

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
        breadcrumb={getBrandBreadcrumb(brand)}
        compact
        right={
          <RangePicker
            from={range.from}
            to={range.to}
            label={range.label}
            shortcuts={shortcuts}
          />
        }
      />

      <div className="m-page-pad" style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
        {/* Banner ≤2★ del periodo (mig 017 + cron alerts). Solo se muestra
            si hay alguna; cap a 5 entradas; CTA al manager con filtro. */}
        {lowRatingTotal > 0 && (
          <div
            style={{
              marginBottom: 16,
              padding: "14px 18px",
              background: "var(--warn-bg, #fdf6ec)",
              border: "1px solid #f0d4a8",
              borderRadius: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "#b35900",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  ⚠️ Atención · Rating bajo
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontFamily: "var(--font-display)",
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {lowRatingTotal === 1
                    ? "1 reseña con rating bajo en este periodo"
                    : `${lowRatingTotal} reseñas con rating bajo en este periodo`}
                </div>
              </div>
              <Link
                href="/manager/resenas?rating_lte=2"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--ink)",
                  textDecoration: "underline",
                }}
              >
                Ver todas →
              </Link>
            </div>
            <ul
              style={{
                margin: "10px 0 0",
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {lowRatingReviews.map((r) => {
                const loc = locationsById.get(r.location_id);
                const date = new Date(r.google_created_at).toLocaleDateString(
                  "es-ES",
                  { day: "2-digit", month: "short", year: "numeric" },
                );
                const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
                return (
                  <li
                    key={r.id}
                    style={{
                      fontSize: 13,
                      color: "var(--ink-2)",
                      display: "flex",
                      gap: 10,
                      alignItems: "baseline",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ color: "#b35900", letterSpacing: 1 }}>{stars}</span>
                    <span style={{ fontWeight: 500 }}>{r.author_name}</span>
                    <span style={{ color: "var(--ink-4)" }}>·</span>
                    <span style={{ color: "var(--ink-3)" }}>
                      {loc?.name ?? "Sin ficha"}
                    </span>
                    <span style={{ color: "var(--ink-4)" }}>·</span>
                    <span style={{ color: "var(--ink-4)", fontSize: 12 }}>{date}</span>
                  </li>
                );
              })}
            </ul>
            {lowRatingTotal > lowRatingReviews.length && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "var(--ink-4)",
                }}
              >
                + {lowRatingTotal - lowRatingReviews.length} más
              </div>
            )}
          </div>
        )}

        {/* KPI row */}
        <div
          className="m-stats-4"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
          }}
        >
          <Stat
            label="Reseñas ≤2★ en el periodo"
            value={lowRatingTotal.toString()}
            sub={
              lowRatingTotal === 0
                ? "Sin alertas en este rango"
                : `Revisa el banner arriba`
            }
            deltaTone={lowRatingTotal === 0 ? "ok" : "warn"}
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
          className="m-grid-hero"
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
                  Reseñas atribuidas · últimos 6 meses
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <AreaChart
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

        {/* Leaderboard del mes — full width. La card "Visitas recientes a
            enlaces" se eliminó tras decisión de producto (las visitas
            como KPI no aportan valor accionable; solo siguen vivas
            internamente para que el matcher atribuya reseñas vía
            share_links). */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
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
                gap: 12,
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
              {leaderboard.length === 0 ? (
                <Pill tone="neutral" withDot>
                  Sin comerciales
                </Pill>
              ) : leaderboard.length > 10 ? (
                <Link
                  href="/ranking"
                  style={{
                    fontSize: 12.5,
                    color: "var(--ink-3)",
                    textDecoration: "none",
                    padding: "6px 10px",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    whiteSpace: "nowrap",
                  }}
                  title="Ver el ranking completo de productores"
                >
                  Ver ranking completo →
                </Link>
              ) : null}
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
              <LeaderboardTable rows={leaderboard} limit={10} />
            )}
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
                        {b.reviews}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
                        reseña{b.reviews === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11.5,
                        color: "var(--ink-4)",
                      }}
                    >
                      {b.salesAssigned} comercial{b.salesAssigned === 1 ? "" : "es"} asignado{b.salesAssigned === 1 ? "" : "s"}
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
        breadcrumb={getBrandBreadcrumb("inseryal")}
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
