import Link from "next/link";
import { Users, Trophy, TrendingUp, Zap } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";


// Forzamos render dinámico: la página usa `new Date()` para proyección ETA
// y deltas vs mes pasado. Si Next cachea la respuesta, los relativos
// quedan stale.
export const dynamic = "force-dynamic";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Ring } from "@/components/charts/Ring";
import { RangePicker } from "@/components/ui/RangePicker";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  parseRange,
  isFullNaturalMonth,
  lastMonthRange,
  bucketByMonth,
  commissionPeriodRange,
  previousCommissionPeriodRange,
  commissionShortcuts,
  isCommissionPeriod,
  type DateRange,
} from "@/lib/date-range";
import { MONTHS } from "@/lib/demo-data";
import { formatEuro } from "@/lib/utils";
import { getLeaderboard } from "@/lib/leaderboard";
import { computePanelBadges } from "@/lib/panel-badges";
import type { SavedTemplates } from "@/lib/messaging";
import { CopyLinkButton } from "./CopyLinkButton";
import { NewClientButton } from "../clientes/NewClientButton";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb } from "@/lib/branding";
import { getMotivationSuffix } from "@/lib/panel-motivation";
import { MonthlyEvolutionCard } from "@/components/panel/MonthlyEvolutionCard";
import {
  RecentReviewsCard,
  type RecentReview,
} from "@/components/panel/RecentReviewsCard";
import { TeamRankSummary } from "@/components/panel/TeamRankSummary";
import { BadgesCard } from "@/components/panel/BadgesCard";

type PanelData = {
  name: string;
  slug: string;
  goal: number;
  /** Reseñas ABONABLES del periodo: counted, no-duplicadas, no-eliminadas. */
  counted: number;
  /** Reseñas POTENCIALES: pending (se abonan al verificarse). */
  pending: number;
  /** Abonables del periodo anterior (de comisión o mes natural). null si la
   *  comparativa no aplica (rango libre) y la pill se oculta. */
  prevCounted: number | null;
  links: number;
  avgRating: number | null;
  /** Tarifa €/reseña del comercial (profiles.commission_rate). null = sin tarifa. */
  commissionRate: number | null;
  insights: PanelInsights;
  /** Plantillas de mensaje personalizadas del comercial. */
  messageTemplates: SavedTemplates;
};

/** Datos del bloque "Histórico, ranking e insignias" (sección inferior). */
type PanelInsights = {
  /** Reseñas verificadas por mes (últimos 6, índice 0 = más antiguo). */
  monthBuckets: number[];
  /** Etiquetas de mes alineadas a `monthBuckets`. */
  monthLabels: string[];
  /** Últimas reseñas verificadas (counted, no-duplicadas). */
  recentReviews: RecentReview[];
  /** Total histórico de reseñas verificadas. */
  lifetimeCounted: number;
  /** Total histórico de reseñas de 5★. */
  fiveStarCount: number;
  /** Posición 0-based en el ranking del equipo; null si no aplica. */
  rankIndex: number | null;
  /** Tamaño del equipo (incluyéndose). */
  teamSize: number;
  /** Si tiene director asignado (cambia el copy del estado "equipo de 1"). */
  hasDirector: boolean;
};

type PanelSearchParams = Promise<{ from?: string; to?: string }>;

const DEMO_DATA: Omit<PanelData, "insights"> = {
  name: "Mateo Salgado",
  slug: "mateo-salgado",
  goal: 80,
  counted: 68,
  pending: 6,
  prevCounted: 61,
  links: 96,
  avgRating: 4.8,
  commissionRate: 2.5,
  messageTemplates: null,
};

/** Etiquetas de los últimos 6 meses terminando en el mes en curso. */
function lastSixMonthLabels(now: Date): string[] {
  const labels: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(MONTHS[d.getMonth()] ?? "");
  }
  return labels;
}

function buildDemoInsights(now: Date): PanelInsights {
  return {
    monthBuckets: [4, 6, 5, 9, 7, 3],
    monthLabels: lastSixMonthLabels(now),
    recentReviews: [
      {
        id: "demo-1",
        author_name: "Andrea Pinto",
        rating: 5,
        google_created_at: "2026-05-30T10:00:00.000Z",
        client_name: "Andrea Pinto",
        place_id: null,
      },
      {
        id: "demo-2",
        author_name: "Familia Soriano",
        rating: 5,
        google_created_at: "2026-05-28T16:30:00.000Z",
        client_name: "Familia Soriano",
        place_id: null,
      },
      {
        id: "demo-3",
        author_name: "Jorge Mas",
        rating: 4,
        google_created_at: "2026-05-26T09:15:00.000Z",
        client_name: null,
        place_id: null,
      },
    ],
    lifetimeCounted: 74,
    fiveStarCount: 61,
    rankIndex: 1,
    teamSize: 8,
    hasDirector: true,
  };
}

async function loadPanelData(range: DateRange, now: Date): Promise<PanelData> {
  const demo = (): PanelData => ({ ...DEMO_DATA, insights: buildDemoInsights(now) });

  if (!isSupabaseConfigured()) return demo();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return demo();

  const profileRes = await supabase
    .from("profiles")
    .select("id, full_name, slug, monthly_goal, commission_rate, director_id, message_templates")
    .eq("id", user.id)
    .maybeSingle<{
      id: string;
      full_name: string;
      slug: string;
      monthly_goal: number;
      commission_rate: number | null;
      director_id: string | null;
      message_templates: SavedTemplates;
    }>();

  if (!profileRes.data) return demo();

  // Comparativa "vs. periodo anterior": si el rango es el periodo de comisión
  // vigente → el periodo de comisión anterior; si es un mes natural completo →
  // el mes pasado; en cualquier otro rango libre no comparamos (null).
  const prev = isCommissionPeriod(range, now)
    ? previousCommissionPeriodRange(now)
    : isFullNaturalMonth(range)
      ? lastMonthRange(parseFromIso(range.from))
      : null;

  // Reseñas del rango con su estado, para separar abonables (counted) de
  // potenciales (pending). Solo no-duplicadas y no-eliminadas.
  const [reviewsRange, links, prevCountedRes] = await Promise.all([
    supabase
      .from("reviews")
      .select("rating, match_state")
      .eq("sales_id", user.id)
      .is("removed_at", null)
      .eq("is_duplicate", false)
      .in("match_state", ["counted", "pending"])
      .gte("google_created_at", range.startIso)
      .lt("google_created_at", range.endIso)
      .returns<{ rating: number; match_state: string }[]>(),
    supabase
      .from("share_links")
      .select("id", { count: "exact", head: true })
      .eq("sales_id", user.id)
      .gte("opened_at", range.startIso)
      .lt("opened_at", range.endIso),
    prev
      ? supabase
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("sales_id", user.id)
          .is("removed_at", null)
          .eq("is_duplicate", false)
          .eq("match_state", "counted")
          .gte("google_created_at", prev.startIso)
          .lt("google_created_at", prev.endIso)
      : Promise.resolve(null),
  ]);

  const rows = reviewsRange.data ?? [];
  const counted = rows.filter((r) => r.match_state === "counted").length;
  const pending = rows.filter((r) => r.match_state === "pending").length;
  const avgRating =
    rows.length === 0
      ? null
      : rows.reduce((sum, r) => sum + r.rating, 0) / rows.length;

  const insights = await loadPanelInsights(
    supabase,
    user.id,
    profileRes.data.director_id,
    range,
    now,
  );

  return {
    name: profileRes.data.full_name,
    slug: profileRes.data.slug,
    counted,
    pending,
    prevCounted: prevCountedRes ? prevCountedRes.count ?? 0 : null,
    links: links.count ?? 0,
    goal: profileRes.data.monthly_goal,
    avgRating,
    commissionRate: profileRes.data.commission_rate,
    insights,
    messageTemplates: profileRes.data.message_templates,
  };
}

/**
 * Carga los datos del bloque "Histórico, ranking e insignias": evolución
 * mensual (6 meses), últimas reseñas verificadas, totales históricos y la
 * posición en el ranking del equipo. Todo se restringe a reseñas verificadas
 * (counted), no-duplicadas y no-eliminadas.
 */
async function loadPanelInsights(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  directorId: string | null,
  range: DateRange,
  now: Date,
): Promise<PanelInsights> {
  const histStartIso = new Date(
    now.getFullYear(),
    now.getMonth() - 5,
    1,
  ).toISOString();

  // Filtro común "reseña verificada del comercial": counted, no-duplicada,
  // no-eliminada. Cada query lo repite inline tras su propio `.select(...)`
  // (los filtros de supabase-js van después de select).
  const [historyRes, lifetimeRes, fiveStarRes, recentRes, leaderboard] =
    await Promise.all([
      supabase
        .from("reviews")
        .select("google_created_at")
        .eq("sales_id", userId)
        .eq("match_state", "counted")
        .is("removed_at", null)
        .eq("is_duplicate", false)
        .gte("google_created_at", histStartIso)
        .returns<{ google_created_at: string }[]>(),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("sales_id", userId)
        .eq("match_state", "counted")
        .is("removed_at", null)
        .eq("is_duplicate", false),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("sales_id", userId)
        .eq("match_state", "counted")
        .is("removed_at", null)
        .eq("is_duplicate", false)
        .eq("rating", 5),
      supabase
        .from("reviews")
        .select(
          "id, author_name, rating, google_created_at, client:clients(full_name), location:locations(google_place_id)",
        )
        .eq("sales_id", userId)
        .eq("match_state", "counted")
        .is("removed_at", null)
        .eq("is_duplicate", false)
        .order("google_created_at", { ascending: false })
        .limit(5)
        .returns<
          {
            id: string;
            author_name: string;
            rating: number;
            google_created_at: string;
            client: { full_name: string } | null;
            location: { google_place_id: string | null } | null;
          }[]
        >(),
      getLeaderboard({
        startIso: range.startIso,
        endIso: range.endIso,
        teamFilter: { directorId },
        currentUserId: userId,
      }),
    ]);

  const monthBuckets = bucketByMonth(
    (historyRes.data ?? []).map((r) => r.google_created_at),
    6,
    now,
  );

  const recentReviews: RecentReview[] = (recentRes.data ?? []).map((r) => ({
    id: r.id,
    author_name: r.author_name,
    rating: r.rating,
    google_created_at: r.google_created_at,
    client_name: r.client?.full_name ?? null,
    place_id: r.location?.google_place_id ?? null,
  }));

  const selfIdx = leaderboard.findIndex((row) => row.isSelf);

  return {
    monthBuckets,
    monthLabels: lastSixMonthLabels(now),
    recentReviews,
    lifetimeCounted: lifetimeRes.count ?? 0,
    fiveStarCount: fiveStarRes.count ?? 0,
    rankIndex: selfIdx === -1 ? null : selfIdx,
    teamSize: leaderboard.length,
    hasDirector: directorId !== null,
  };
}

function parseFromIso(ymd: string): Date {
  const parts = ymd.split("-").map(Number);
  return new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

function formatRating(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(1).replace(".", ",");
}

function deltaPill(current: number, previous: number | null, suffix = "vs. periodo anterior") {
  if (previous === null) return null;
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  if (diff === 0) return <Pill withDot>=0 {suffix}</Pill>;
  const sign = diff > 0 ? "+" : "";
  return (
    <Pill tone={diff > 0 ? "ok" : "warn"} withDot>
      {sign}
      {diff} {suffix}
    </Pill>
  );
}

/**
 * Proyección al objetivo del periodo activo (de comisión o mes natural).
 * `periodStartIso`/`periodEndIso` son los límites del rango (endIso exclusivo,
 * 00:00 del día siguiente al `to`). El ritmo se calcula sobre los días ya
 * transcurridos del periodo, no sobre el día del mes.
 */
function projection({
  counted,
  goal,
  now,
  periodStartIso,
  periodEndIso,
}: {
  counted: number;
  goal: number;
  now: Date;
  periodStartIso: string;
  periodEndIso: string;
}): { remaining: number; daysLeft: number; etaLabel: string | null } {
  const day = 1000 * 60 * 60 * 24;
  const periodStart = new Date(periodStartIso);
  const periodEnd = new Date(periodEndIso);
  const remaining = Math.max(goal - counted, 0);
  const daysLeft = Math.max(Math.ceil((periodEnd.getTime() - now.getTime()) / day), 0);
  const daysElapsed = Math.max(Math.ceil((now.getTime() - periodStart.getTime()) / day), 1);
  const ratePerDay = counted / daysElapsed;
  if (remaining === 0) {
    return { remaining: 0, daysLeft, etaLabel: "Objetivo cumplido" };
  }
  if (ratePerDay <= 0) {
    return { remaining, daysLeft, etaLabel: null };
  }
  const daysToReach = Math.ceil(remaining / ratePerDay);
  const eta = new Date(now);
  eta.setDate(now.getDate() + daysToReach);
  if (eta.getTime() >= periodEnd.getTime()) {
    return { remaining, daysLeft, etaLabel: null };
  }
  const label = eta.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  return { remaining, daysLeft, etaLabel: label };
}

/** "19 jun" — día de cierre del periodo (el `to`, último día incluido). */
function formatCloseDate(toYmd: string): string {
  const parts = toYmd.split("-").map(Number);
  const d = new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export default async function PanelPage({
  searchParams,
}: {
  searchParams: PanelSearchParams;
}) {
  const params = await searchParams;
  const brand = await getCurrentUserBrand();
  const now = new Date();
  // El comercial arranca en el PERIODO DE COMISIÓN (20→19), no en el mes
  // natural. El selector permite cambiar a mes natural o rango libre.
  const range = parseRange(params.from, params.to, now, commissionPeriodRange);
  const shortcuts = commissionShortcuts(now);
  const isCommission = isCommissionPeriod(range, now);
  // La proyección al objetivo solo tiene sentido cuando seguimos dentro del
  // rango activo (es decir, el rango incluye hoy).
  const isCurrentPeriod =
    new Date(range.startIso).getTime() <= now.getTime() &&
    now.getTime() < new Date(range.endIso).getTime();

  const data = await loadPanelData(range, now);
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://reseñahub.es";
  const link = `${appBase.replace(/^https?:\/\//, "")}/c/${data.slug}`;
  const fullUrl = `${appBase}/c/${data.slug}`;

  const { remaining, daysLeft, etaLabel } = projection({
    counted: data.counted,
    goal: data.goal,
    now,
    periodStartIso: range.startIso,
    periodEndIso: range.endIso,
  });
  const dayOfWeek = now.getDay();

  // Importe estimado de comisión: abonables × tarifa. null si el comercial no
  // tiene tarifa configurada (la pone admin/gestor/director en su ficha).
  const rate = data.commissionRate;
  const earnedEuro = rate !== null ? rate * data.counted : null;
  const pendingEuro = rate !== null ? rate * data.pending : null;
  const closeDate = formatCloseDate(range.to);

  const badges = computePanelBadges({
    lifetimeCounted: data.insights.lifetimeCounted,
    reviewsThisPeriod: data.counted,
    goal: data.goal,
    monthBuckets: data.insights.monthBuckets,
    fiveStarCount: data.insights.fiveStarCount,
    rankIndex: data.insights.rankIndex,
    teamSize: data.insights.teamSize,
  });

  return (
    <>
      <Topbar
        title="Mi panel"
        subtitle={`Buenos días, ${data.name.split(" ")[0]}`}
        range={null}
        breadcrumb={getBrandBreadcrumb(brand)}
        compact
        right={
          <>
            <RangePicker
              from={range.from}
              to={range.to}
              label={range.label}
              shortcuts={shortcuts}
            />
            <NewClientButton
              appBase={appBase}
              salesName={data.name}
              salesSlug={data.slug}
              brand={brand}
              templates={data.messageTemplates}
            />
          </>
        }
      />

      <div className="m-page-pad" style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
        <Card padding={28}>
          <div
            className="m-grid-hero"
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr",
              gap: 32,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                {isCommission ? "Periodo de comisión" : "Periodo"} ·{" "}
                <strong style={{ color: "var(--ink-2)", fontWeight: 600 }}>{range.label}</strong>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 14,
                  marginTop: 6,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 64,
                    fontWeight: 600,
                    letterSpacing: "-0.035em",
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {data.counted}
                </span>
                <span style={{ fontSize: 16, color: "var(--ink-3)" }}>
                  reseñas abonables
                </span>
                {deltaPill(data.counted, data.prevCounted)}
              </div>

              {/* Importe estimado de comisión */}
              {earnedEuro !== null ? (
                <div style={{ marginTop: 10, fontSize: 14, color: "var(--ink-2)" }}>
                  ≈{" "}
                  <strong style={{ color: "var(--ink)", fontSize: 16 }}>
                    {formatEuro(earnedEuro)}
                  </strong>{" "}
                  en comisión
                  {data.pending > 0 && pendingEuro !== null && (
                    <span style={{ color: "var(--ink-4)" }}>
                      {" "}· +{formatEuro(pendingEuro)} si se verifican las {data.pending} pendientes
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--ink-4)" }}>
                  Tu tarifa por reseña aún no está configurada — consúltala con tu responsable.
                </div>
              )}

              <div
                style={{
                  marginTop: 18,
                  display: "flex",
                  gap: 32,
                  color: "var(--ink-3)",
                  fontSize: 13,
                  flexWrap: "wrap",
                }}
              >
                <span>
                  <span style={{ color: "var(--ink-4)" }}>Por verificar</span>{" "}
                  <strong style={{ color: "var(--ink)" }}>{data.pending}</strong>
                </span>
                <span>
                  <span style={{ color: "var(--ink-4)" }}>Estrellas</span>{" "}
                  <strong style={{ color: "var(--ink)" }}>
                    {formatRating(data.avgRating)}
                  </strong>
                </span>
                {isCurrentPeriod && (
                  <span>
                    <span style={{ color: "var(--ink-4)" }}>Cierra el</span>{" "}
                    <strong style={{ color: "var(--ink)" }}>{closeDate}</strong>
                    <span style={{ color: "var(--ink-4)" }}> · faltan {daysLeft} días</span>
                  </span>
                )}
              </div>
            </div>

            <div className="m-ring-row" style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <Ring value={data.counted} max={data.goal} size={140} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Objetivo del periodo</div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    marginTop: 4,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {data.counted} / {data.goal}
                </div>
                <div className="m-callout-wide" style={{ marginTop: 8 }}>
                  {!isCurrentPeriod ? (
                    <span style={{ fontSize: 12.5, color: "var(--ink-4)", lineHeight: 1.5 }}>
                      Vista del rango {range.label}. La proyección al objetivo solo se calcula sobre el periodo en curso.
                    </span>
                  ) : (
                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: 6,
                        background: remaining === 0 || etaLabel ? "var(--ok-bg)" : "var(--warn-bg)",
                        display: "flex",
                        gap: 7,
                        alignItems: "flex-start",
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        color: remaining === 0 || etaLabel ? "var(--ok)" : "var(--warn)",
                      }}
                    >
                      {remaining === 0 ? (
                        <Trophy size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                      ) : etaLabel ? (
                        <TrendingUp size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                      ) : (
                        <Zap size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                      )}
                      <div>
                        {remaining === 0 ? (
                          <>
                            <strong>Objetivo conseguido.</strong>{" "}
                            {getMotivationSuffix(dayOfWeek, "done", { daysLeft })}
                          </>
                        ) : etaLabel ? (
                          <>
                            Faltan <strong>{remaining} reseñas</strong> en {daysLeft} días.{" "}
                            {getMotivationSuffix(dayOfWeek, "on_track", { daysLeft })} Con tu ritmo actual cierras objetivo el{" "}
                            <strong>{etaLabel}</strong>.
                          </>
                        ) : (
                          <>
                            Faltan <strong>{remaining} reseñas</strong> en {daysLeft} días.{" "}
                            {getMotivationSuffix(dayOfWeek, "behind", { daysLeft })}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Card "Ver mis clientes" — solo mobile (en desktop el sidebar ya lo cubre). */}
        <div className="m-mobile-only" style={{ marginTop: 16 }}>
          <Link
            href="/clientes"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 18px",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 14,
              textDecoration: "none",
              color: "var(--ink)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--surface-2)",
                display: "grid",
                placeItems: "center",
                color: "var(--ink-2)",
                flexShrink: 0,
              }}
            >
              <Users size={20} strokeWidth={1.75} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
                Ver mis clientes
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-4)", marginTop: 2 }}>
                Da de alta antes de pedir una reseña
              </div>
            </div>
            <span aria-hidden="true" style={{ color: "var(--ink-4)", fontSize: 18 }}>
              ›
            </span>
          </Link>
        </div>

        <div style={{ marginTop: 16 }}>
          <Card padding={24}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                  Tu enlace personal
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    marginTop: 4,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Para QR impreso o enlace genérico
                </div>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 12.5,
                    color: "var(--ink-4)",
                    lineHeight: 1.55,
                    maxWidth: 540,
                  }}
                >
                  Si vas a enviárselo a un cliente concreto, da de alta su nombre en{" "}
                  <strong style={{ color: "var(--ink-3)" }}>Mis clientes</strong>: el
                  enlace personalizado mejora la atribución automática.
                </p>
              </div>
              <Pill tone="ok" withDot>
                Activo
              </Pill>
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  padding: "14px 14px",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 10,
                  background: "var(--surface-2)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13.5,
                    color: "var(--ink-2)",
                    wordBreak: "break-all",
                    minWidth: 0,
                    flex: "1 1 200px",
                  }}
                >
                  {link}
                </span>
                <CopyLinkButton url={fullUrl} label="Copiar" />
              </div>
              <div style={{ marginTop: 12 }}>
                <Link
                  href="/clientes"
                  style={{
                    display: "inline-block",
                    padding: "7px 12px",
                    border: "1px solid var(--line-strong)",
                    background: "var(--ink)",
                    color: "#fff",
                    borderRadius: 9,
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  Generar enlace por cliente →
                </Link>
              </div>
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 16 }}>
          <MonthlyEvolutionCard
            data={data.insights.monthBuckets}
            labels={data.insights.monthLabels}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <TeamRankSummary
            rankIndex={data.insights.rankIndex}
            teamSize={data.insights.teamSize}
            hasDirector={data.insights.hasDirector}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <RecentReviewsCard reviews={data.insights.recentReviews} />
        </div>

        <div style={{ marginTop: 16 }}>
          <BadgesCard badges={badges} />
        </div>
      </div>

    </>
  );
}
