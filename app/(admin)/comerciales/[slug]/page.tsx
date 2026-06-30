import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Stars } from "@/components/ui/Stars";
import { DuplicateBadge } from "@/components/ui/DuplicateBadge";
import { GoogleReviewLink } from "@/components/ui/GoogleReviewLink";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import { RangePicker } from "@/components/ui/RangePicker";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  parseRange,
  isFullNaturalMonth,
  isCommissionPeriod,
  commissionPeriodRange,
  previousCommissionPeriodRange,
  commissionShortcuts,
  lastMonthRange,
  bucketByMonth,
  type DateRange,
} from "@/lib/date-range";
import { getLeaderboard } from "@/lib/leaderboard";
import { computePanelBadges } from "@/lib/panel-badges";
import { MONTHS } from "@/lib/demo-data";
import type { PauseReason, ProfileStatus, SalesDepartment } from "@/lib/supabase/types";
import { ArchiveSalesButton } from "../ArchiveSalesButton";
import { DeleteSalesButton } from "../DeleteSalesButton";
import { ResendAccessButton } from "@/components/ui/ResendAccessButton";
import { resendSalesAccess, uploadSalesAvatar, removeSalesAvatar } from "../actions";
import { SalesEditCard } from "./SalesEditCard";
import { ProducerSummary } from "@/components/panel/ProducerSummary";

// El render usa `new Date()` para el periodo de comisión y la proyección de días.
export const dynamic = "force-dynamic";

const DEPARTMENT_LABELS: Record<SalesDepartment, string> = {
  nacional: "Nacional",
  internacional: "Internacional",
  castellon: "Castellón",
  valencia: "Valencia",
};

const PAUSE_REASON_LABELS: Record<PauseReason, string> = {
  vacaciones: "Vacaciones",
  baja_medica: "Baja médica",
  permiso_laboral: "Permiso laboral",
};

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
};

type SalesDetail = {
  id: string;
  full_name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  monthly_goal: number;
  commission_rate: number | null;
  commission_cap: number | null;
  status: ProfileStatus;
  joined_at: string;
  location_id: string | null;
  director_id: string | null;
  cross_location: boolean;
  role: "sales" | "office_director";
  avatar_url: string | null;
  location: { id: string; name: string } | null;
  department: SalesDepartment | null;
  language: string | null;
  paused_reason: PauseReason | null;
  notes: string | null;
  archived_at: string | null;
};

type ClientWithCounts = {
  id: string;
  full_name: string;
  slug: string;
  created_at: string;
  visits: number;
  reviews: number;
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
  is_duplicate: boolean;
  google_maps_url: string | null;
  location: { id: string; name: string; google_place_id: string | null } | null;
};

type ProducerInsights = {
  monthBuckets: number[];
  monthLabels: string[];
  lifetimeCounted: number;
  fiveStarCount: number;
  prevCounted: number | null;
  rankIndex: number | null;
  teamSize: number;
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

function parseFromYmd(ymd: string): Date {
  const parts = ymd.split("-").map(Number);
  return new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

/** "19 jun" — día de cierre del periodo (el `to`, último día incluido). */
function formatCloseDate(toYmd: string): string {
  return parseFromYmd(toYmd).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Resumen productivo de un comercial para la ficha de gestión: evolución 6
 * meses, totales históricos, comparativa con el periodo anterior y posición en
 * el ranking del equipo. Espeja `loadPanelInsights` del panel pero parametrizado
 * por el id del comercial visto. Corre con el cliente del viewer (RLS acota al
 * director a su equipo); `getLeaderboard` usa service-role para el ranking.
 */
async function loadProducerInsights(
  supabase: Awaited<ReturnType<typeof createClient>>,
  salesId: string,
  directorId: string | null,
  range: DateRange,
  now: Date,
): Promise<ProducerInsights> {
  const histStartIso = new Date(
    now.getFullYear(),
    now.getMonth() - 5,
    1,
  ).toISOString();
  const prev = isCommissionPeriod(range, now)
    ? previousCommissionPeriodRange(now)
    : isFullNaturalMonth(range)
      ? lastMonthRange(parseFromYmd(range.from))
      : null;

  const [historyRes, lifetimeRes, fiveStarRes, prevCountedRes, leaderboard] =
    await Promise.all([
      supabase
        .from("reviews")
        .select("google_created_at")
        .eq("sales_id", salesId)
        .eq("match_state", "counted")
        .is("removed_at", null)
        .eq("is_duplicate", false)
        .gte("google_created_at", histStartIso)
        .returns<{ google_created_at: string }[]>(),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("sales_id", salesId)
        .eq("match_state", "counted")
        .is("removed_at", null)
        .eq("is_duplicate", false),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("sales_id", salesId)
        .eq("match_state", "counted")
        .is("removed_at", null)
        .eq("is_duplicate", false)
        .eq("rating", 5),
      prev
        ? supabase
            .from("reviews")
            .select("id", { count: "exact", head: true })
            .eq("sales_id", salesId)
            .eq("match_state", "counted")
            .is("removed_at", null)
            .eq("is_duplicate", false)
            .gte("google_created_at", prev.startIso)
            .lt("google_created_at", prev.endIso)
        : Promise.resolve(null),
      getLeaderboard({
        startIso: range.startIso,
        endIso: range.endIso,
        teamFilter: { directorId },
        currentUserId: salesId,
        metric: "counted",
      }),
    ]);

  const monthBuckets = bucketByMonth(
    (historyRes.data ?? []).map((r) => r.google_created_at),
    6,
    now,
  );
  const selfIdx = leaderboard.findIndex((row) => row.isSelf);

  return {
    monthBuckets,
    monthLabels: lastSixMonthLabels(now),
    lifetimeCounted: lifetimeRes.count ?? 0,
    fiveStarCount: fiveStarRes.count ?? 0,
    prevCounted: prevCountedRes ? prevCountedRes.count ?? 0 : null,
    rankIndex: selfIdx === -1 ? null : selfIdx,
    teamSize: leaderboard.length,
  };
}

export default async function ComercialDetallePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  // La ficha del comercial se alinea al PERIODO DE COMISIÓN (20→19), igual que
  // el panel del comercial — así el gestor ve la misma foto que ve el comercial
  // (y que cuadra con lo que cobra). El selector permite mes natural/pasado.
  const now = new Date();
  const range = parseRange(sp.from, sp.to, now, commissionPeriodRange);
  const isCommission = isCommissionPeriod(range, now);
  const isCurrentPeriod =
    new Date(range.startIso).getTime() <= now.getTime() &&
    now.getTime() < new Date(range.endIso).getTime();
  const shortcuts = commissionShortcuts(now);
  let viewerRole: string | null = null;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Detalle"
          subtitle="Modo demo — sin base de datos"
          breadcrumb="Comerciales"
          breadcrumbHref="/comerciales"
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

  // Rol del visor para condicionar acciones admin (Editar / Eliminar).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: string }>();
    viewerRole = profile?.role ?? null;
  }
  // Admin, reviews_manager y office_director administran al comercial
  // (editar objetivo/ficha/estado, reenviar acceso, archivar). El director
  // queda acotado a SU equipo por la RLS de la migración 013 + el scope de
  // las server actions. Ver migración 005 (manager) y 013 (director).
  const canEdit =
    viewerRole === "admin" ||
    viewerRole === "reviews_manager" ||
    viewerRole === "office_director";
  // Borrado permanente reservado a admin/manager (el director solo archiva).
  const canDelete = viewerRole === "admin" || viewerRole === "reviews_manager";
  // Para el director, ficha y director responsable se fijan a SU oficina y a
  // él mismo → bloqueamos esos selectores en el formulario de edición.
  const isDirector = viewerRole === "office_director";

  const [salesRes, locsRes, dirRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, slug, email, phone, monthly_goal, commission_rate, commission_cap, status, joined_at, department, language, paused_reason, notes, archived_at, location_id, director_id, cross_location, role, avatar_url, location:locations(id, name)",
      )
      .eq("slug", slug)
      .in("role", ["sales", "office_director"])
      .maybeSingle<SalesDetail>(),
    supabase.from("locations").select("id, name").order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, slug, location_id")
      .eq("role", "office_director")
      .neq("status", "archived")
      .order("full_name")
      .returns<{ id: string; full_name: string; slug: string; location_id: string | null }[]>(),
  ]);

  const sales = salesRes.data;
  if (!sales) notFound();

  const locations = (locsRes.data ?? []) as { id: string; name: string }[];
  const directors = dirRes.data ?? [];
  // Resolvemos el director responsable en JS para no depender de la FK
  // auto-referencial en el select de PostgREST.
  const directorOfSales = sales.director_id
    ? directors.find((d) => d.id === sales.director_id) ?? null
    : null;

  // Carga clientes + share_links + reviews + resumen productivo en paralelo.
  const [clientsRes, sharesRes, reviewsRes, insights] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name, slug, created_at")
      .eq("sales_id", sales.id)
      .order("created_at", { ascending: false })
      .limit(2000)
      .returns<
        { id: string; full_name: string; slug: string; created_at: string }[]
      >(),
    supabase
      .from("share_links")
      .select("client_id, opened_at")
      .eq("sales_id", sales.id)
      .gte("opened_at", range.startIso)
      .lt("opened_at", range.endIso)
      .returns<{ client_id: string | null; opened_at: string }[]>(),
    supabase
      .from("reviews")
      .select(
        "id, author_name, rating, text, google_created_at, match_state, match_confidence, client_id, is_duplicate, google_maps_url, location:locations(id, name, google_place_id)",
      )
      .eq("sales_id", sales.id)
      .is("removed_at", null)
      .gte("google_created_at", range.startIso)
      .lt("google_created_at", range.endIso)
      .order("google_created_at", { ascending: false })
      .limit(1000)
      .returns<ReviewRow[]>(),
    loadProducerInsights(supabase, sales.id, sales.director_id, range, now),
  ]);

  const clientsRaw = clientsRes.data ?? [];
  const shares = sharesRes.data ?? [];
  const reviews = reviewsRes.data ?? [];

  // Agregados por cliente
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

  const clients: ClientWithCounts[] = clientsRaw.map((c) => ({
    ...c,
    visits: visitsByClient.get(c.id) ?? 0,
    reviews: reviewsByClient.get(c.id) ?? 0,
  }));

  // Lookup id → nombre completo para enseñar a qué cliente está atribuida
  // cada reseña en la lista de abajo (sin hacer una query extra).
  const clientNameById = new Map<string, string>();
  for (const c of clientsRaw) clientNameById.set(c.id, c.full_name);

  // ─── KPIs del rango ────────────────────────────────────────────────────
  // shares y reviews ya vienen filtrados por SQL al rango activo.
  const visitsInRange = shares.length;
  // KPIs anti-fraude (migración 015): solo cuentan reseñas NO duplicadas.
  // Los duplicados siguen apareciendo en el listado abajo con badge "Duplicada".
  const reviewsCounted = reviews.filter(
    (r) => r.match_state === "counted" && !r.is_duplicate,
  ).length;
  const reviewsPending = reviews.filter(
    (r) => r.match_state === "pending" && !r.is_duplicate,
  ).length;
  const reviewsDuplicates = reviews.filter((r) => r.is_duplicate).length;
  // Media de estrellas sobre abonables+potenciales no-duplicadas (misma base
  // que usa el panel del comercial) para el resumen productivo.
  const abonablesRows = reviews.filter(
    (r) => (r.match_state === "counted" || r.match_state === "pending") && !r.is_duplicate,
  );
  const summaryAvg =
    abonablesRows.length > 0
      ? abonablesRows.reduce((s, r) => s + r.rating, 0) / abonablesRows.length
      : null;

  // Cierre/días restantes del periodo (solo se muestran si el rango incluye hoy).
  const dayMs = 86_400_000;
  const daysLeft = Math.max(
    Math.ceil((new Date(range.endIso).getTime() - now.getTime()) / dayMs),
    0,
  );
  const closeDate = formatCloseDate(range.to);

  const badges = computePanelBadges({
    lifetimeCounted: insights.lifetimeCounted,
    reviewsThisPeriod: reviewsCounted,
    goal: sales.monthly_goal,
    monthBuckets: insights.monthBuckets,
    fiveStarCount: insights.fiveStarCount,
    rankIndex: insights.rankIndex,
    teamSize: insights.teamSize,
  });

  // Querystring para los enlaces dependientes del rango (Excel, etc.).
  // El Excel individual usa el endpoint /api/export/sales/[id] con
  // formato propio del comercial (cabecera + tabla limpia), distinto del
  // parte global /api/export/reviews (4 hojas departamentales + Detalle).
  const exportParams = new URLSearchParams({
    from: range.from,
    to: range.to,
  });

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
        subtitle={
          // Director productor → "★ Director · Internacional"; comercial → "Comercial · Internacional".
          (sales.role === "office_director" ? "★ Responsable" : "Comercial") +
          (sales.department ? ` · ${DEPARTMENT_LABELS[sales.department]}` : "")
        }
        breadcrumb="Comerciales"
        breadcrumbHref="/comerciales"
        range={null}
        compact
        right={
          <>
            <RangePicker
              from={range.from}
              to={range.to}
              label={range.label}
              shortcuts={shortcuts}
            />
            <Link
              href={`/api/export/sales/${sales.id}?${exportParams.toString()}`}
              style={primaryBtn}
            >
              Descargar Excel
            </Link>
            <Link href="/comerciales" style={linkBtn}>
              ← Todos
            </Link>
            {canEdit && sales.role === "sales" && (
              <>
                {sales.status !== "archived" && (
                  <ResendAccessButton
                    id={sales.id}
                    name={sales.full_name}
                    action={resendSalesAccess}
                    variant="prominent"
                  />
                )}
                <ArchiveSalesButton
                  id={sales.id}
                  name={sales.full_name}
                  mode={sales.status === "archived" ? "restore" : "archive"}
                  redirectTo={sales.status === "archived" ? undefined : "/comerciales"}
                  variant="prominent"
                />
                {/* Borrado permanente solo admin/manager (no director). */}
                {canDelete && (
                  <DeleteSalesButton
                    id={sales.id}
                    name={sales.full_name}
                    archived={sales.status === "archived"}
                    redirectToList
                  />
                )}
              </>
            )}
            {canEdit && sales.role === "office_director" && (
              // Los directores se invitan/editan/archivan/eliminan desde
              // /directores (sus actions tienen scope distinto al de sales).
              // Aquí solo se les ve como productores read-only.
              <Link href="/directores" style={linkBtn} title="Gestionar este responsable en /directores">
                Gestionar en /directores
              </Link>
            )}
          </>
        }
      />

      <div
        className="m-page-pad"
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* Cabecera con avatar (editable por admin/gestor/director si es un
            comercial activo; read-only para directores-productor o archivados) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "4px 0 4px 4px",
          }}
        >
          {canEdit && sales.role === "sales" && sales.status !== "archived" ? (
            <AvatarUploader
              name={sales.full_name}
              initialAvatarUrl={sales.avatar_url}
              upload={uploadSalesAvatar.bind(null, sales.id)}
              remove={removeSalesAvatar.bind(null, sales.id)}
              size={56}
              hint="PNG, JPG o WebP. Máximo 4 MB."
            />
          ) : (
            <Avatar name={sales.full_name} src={sales.avatar_url} size={56} />
          )}
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

        {/* Resumen productivo — la misma foto que ve el comercial en su panel
            (abonables, €, objetivo, estrellas, evolución, ranking, insignias),
            en periodo de comisión. Ver CLAUDE.md §4.42. */}
        <ProducerSummary
          periodLabel={range.label}
          isCommissionPeriod={isCommission}
          isCurrentPeriod={isCurrentPeriod}
          counted={reviewsCounted}
          pending={reviewsPending}
          prevCounted={insights.prevCounted}
          avgRating={summaryAvg}
          goal={sales.monthly_goal}
          commissionRate={sales.commission_rate}
          commissionCap={sales.commission_cap}
          closeDate={closeDate}
          daysLeft={daysLeft}
          monthBuckets={insights.monthBuckets}
          monthLabels={insights.monthLabels}
          rankIndex={insights.rankIndex}
          teamSize={insights.teamSize}
          badges={badges}
          rankingHref="/ranking"
        />

        {/* Datos editables (admin/gestor/director) o read-only */}
        {canEdit && sales.status !== "archived" && sales.role === "sales" ? (
          // Solo editamos en línea a los sales — para directores se pasa
          // por /directores (sus server actions tienen otras validaciones).
          <SalesEditCard
            id={sales.id}
            email={sales.email}
            phone={sales.phone}
            slug={sales.slug}
            joinedAt={sales.joined_at}
            locations={locations}
            directors={directors}
            lockScope={isDirector}
            initial={{
              locationId: sales.location_id,
              directorId: sales.director_id,
              crossLocation: sales.cross_location,
              monthlyGoal: sales.monthly_goal,
              commissionRate: sales.commission_rate,
              commissionCap: sales.commission_cap,
              status: sales.status,
              department: sales.department,
              language: sales.language,
              pausedReason: sales.paused_reason,
              notes: sales.notes,
            }}
          />
        ) : (
          <SalesReadOnlyCard sales={sales} joinedAt={sales.joined_at} />
        )}

        {/* Clientes */}
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
              Reseñas del rango · {range.label}
            </span>
          </div>

          {clients.length === 0 ? (
            <div style={{ padding: "28px 22px" }}>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--ink-3)",
                  lineHeight: 1.55,
                  maxWidth: 560,
                }}
              >
                Este comercial aún no ha registrado clientes. En cuanto añada uno
                desde su pestaña <strong style={{ color: "var(--ink-2)" }}>Mis clientes</strong>,
                aparecerá aquí con sus reseñas asociadas.
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: "10px 22px",
                  borderBottom: "1px solid var(--line)",
                  display: "grid",
                  gridTemplateColumns: "2.4fr 0.8fr 1fr",
                  gap: 14,
                  fontSize: 11,
                  color: "var(--ink-4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                <span>Cliente</span>
                <span style={{ textAlign: "right" }}>Reseñas</span>
                <span>Alta</span>
              </div>
              {clients.map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    padding: "12px 22px",
                    borderBottom: i === clients.length - 1 ? "none" : "1px solid var(--line)",
                    display: "grid",
                    gridTemplateColumns: "2.4fr 0.8fr 1fr",
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
                      color: c.reviews > 0 ? "var(--ink)" : "var(--ink-4)",
                    }}
                  >
                    {c.reviews}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
                    {fmtDate(c.created_at)}
                  </span>
                </div>
              ))}
            </>
          )}
        </Card>

        {/* Reseñas atribuidas */}
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={sectionLabel}>Reseñas en {range.label}</div>
            <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
              {reviews.length} total · {reviewsCounted} atribuidas · {reviewsPending} pendientes
              {reviewsDuplicates > 0 && ` · ${reviewsDuplicates} duplicadas`}
            </span>
          </div>
          {reviews.length === 0 ? (
            <div
              style={{
                marginTop: 14,
                padding: "20px 18px",
                border: "1px dashed var(--line-strong)",
                borderRadius: 10,
                background: "var(--surface-2)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: "-0.015em",
                  color: "var(--ink-2)",
                }}
              >
                Sin reseñas en {range.label}
              </div>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--ink-3)",
                  maxWidth: 560,
                }}
              >
                Cuando se conecte Google Business Profile (Fase 4 pendiente) y los
                clientes dejen reseña, aparecerán aquí con su rating y el estado
                del matching automático.
                {visitsInRange > 0 && (
                  <>
                    {" "}
                    Mientras tanto, el enlace ha sido abierto{" "}
                    <strong style={{ color: "var(--ink)" }}>{visitsInRange}</strong>{" "}
                    {visitsInRange === 1 ? "vez" : "veces"} en este rango.
                  </>
                )}
              </p>
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
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, letterSpacing: "-0.005em" }}>
                        {r.author_name}
                      </div>
                      {r.client_id && clientNameById.get(r.client_id) && (
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: 11.5,
                            color: "var(--ink-4)",
                          }}
                        >
                          Cliente: {clientNameById.get(r.client_id)}
                        </div>
                      )}
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
                      alignItems: "center",
                      fontSize: 11.5,
                      color: "var(--ink-4)",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{fmtDate(r.google_created_at)}</span>
                    <span>·</span>
                    <span>
                      Match {r.match_state} · confianza {r.match_confidence}%
                    </span>
                    {r.is_duplicate && <DuplicateBadge />}
                    <GoogleReviewLink
                      placeId={r.location?.google_place_id}
                      mapsUrl={r.google_maps_url}
                      variant="compact"
                    />
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

const linkBtn: React.CSSProperties = {
  padding: "7px 12px",
  background: "transparent",
  border: "1px solid var(--line-strong)",
  borderRadius: 9,
  fontSize: 13,
  color: "var(--ink-2)",
  textDecoration: "none",
  fontWeight: 500,
};

const primaryBtn: React.CSSProperties = {
  padding: "7px 12px",
  background: "var(--ink)",
  color: "#fff",
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 500,
  textDecoration: "none",
};

function statusLabel(s: ProfileStatus): string {
  if (s === "active") return "Activo";
  if (s === "paused") return "Pausado";
  if (s === "archived") return "Archivado";
  return "Invitado";
}

function SalesReadOnlyCard({
  sales,
  joinedAt,
}: {
  sales: SalesDetail;
  joinedAt: string;
}) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const joinedFmt = fmt(joinedAt);
  const archivedFmt = sales.archived_at ? fmt(sales.archived_at) : null;
  return (
    <Card>
      <div style={sectionLabel}>Ficha del comercial</div>
      {sales.status === "archived" && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            background: "var(--surface-2)",
            border: "1px dashed var(--line-strong)",
            borderRadius: 8,
            fontSize: 12.5,
            color: "var(--ink-3)",
            lineHeight: 1.5,
          }}
        >
          Este comercial está <strong style={{ color: "var(--ink)" }}>archivado</strong>
          {archivedFmt ? <> desde el {archivedFmt}</> : null}. Sus reseñas se
          siguen incluyendo en la fila &quot;Bajas comerciales&quot; del parte
          mensual. Pulsa <strong style={{ color: "var(--ink)" }}>Restaurar comercial</strong>
          {" "}para devolverlo al listado.
        </div>
      )}
      <dl
        style={{
          margin: "14px 0 0",
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          rowGap: 10,
          columnGap: 18,
          fontSize: 13.5,
        }}
      >
        <Term label="Email" value={sales.email ?? "—"} mono />
        <Term label="Teléfono" value={sales.phone ?? "—"} />
        <Term
          label="Departamento"
          value={sales.department ? DEPARTMENT_LABELS[sales.department] : "—"}
        />
        {sales.department === "internacional" && (
          <Term label="Idioma" value={sales.language ?? "—"} />
        )}
        <Term label="Ficha asignada" value={sales.location?.name ?? "—"} />
        <Term label="Objetivo mensual" value={String(sales.monthly_goal)} />
        <Term
          label="Reseñas bonificables"
          value={sales.commission_cap === null ? "Sin tope" : `máx. ${sales.commission_cap} / periodo`}
        />
        <Term label="Estado" value={statusLabel(sales.status)} />
        {sales.status === "paused" && sales.paused_reason && (
          <Term label="Motivo pausa" value={PAUSE_REASON_LABELS[sales.paused_reason]} />
        )}
        <Term label="Alta" value={joinedFmt} />
        {sales.notes && <Term label="Notas" value={sales.notes} />}
      </dl>
    </Card>
  );
}

function Term({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt
        style={{
          fontSize: 11.5,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          alignSelf: "center",
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          color: "var(--ink)",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          fontSize: mono ? 12.5 : 13.5,
        }}
      >
        {value}
      </dd>
    </>
  );
}
