import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Stars } from "@/components/ui/Stars";
import { DuplicateBadge } from "@/components/ui/DuplicateBadge";
import { Avatar } from "@/components/ui/Avatar";
import { RangePicker } from "@/components/ui/RangePicker";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseRange, defaultShortcuts, isFullNaturalMonth } from "@/lib/date-range";
import type { PauseReason, ProfileStatus, SalesDepartment } from "@/lib/supabase/types";
import { ArchiveSalesButton } from "../ArchiveSalesButton";
import { DeleteSalesButton } from "../DeleteSalesButton";
import { ResendAccessButton } from "@/components/ui/ResendAccessButton";
import { resendSalesAccess } from "../actions";
import { SalesEditCard } from "./SalesEditCard";

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
  status: ProfileStatus;
  joined_at: string;
  location_id: string | null;
  director_id: string | null;
  role: "sales" | "office_director";
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
};

export default async function ComercialDetallePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const range = parseRange(sp.from, sp.to);
  const isMonthRange = isFullNaturalMonth(range);
  const shortcuts = defaultShortcuts();
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
  // Admin y reviews_manager comparten administración total del comercial
  // (editar objetivo/ficha/estado, reenviar acceso, eliminar). Ver migración
  // 005 y assertCanManageSales en actions.ts.
  const canEdit = viewerRole === "admin" || viewerRole === "reviews_manager";

  const [salesRes, locsRes, dirRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, slug, email, phone, monthly_goal, status, joined_at, department, language, paused_reason, notes, archived_at, location_id, director_id, role, location:locations(id, name)",
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

  // Carga clientes + share_links + reviews en paralelo y agrega en JS.
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
      .gte("opened_at", range.startIso)
      .lt("opened_at", range.endIso)
      .returns<{ client_id: string | null; opened_at: string }[]>(),
    supabase
      .from("reviews")
      .select(
        "id, author_name, rating, text, google_created_at, match_state, match_confidence, client_id, is_duplicate",
      )
      .eq("sales_id", sales.id)
      .is("removed_at", null)
      .gte("google_created_at", range.startIso)
      .lt("google_created_at", range.endIso)
      .order("google_created_at", { ascending: false })
      .returns<ReviewRow[]>(),
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
  const reviewsUnmatched = reviews.filter((r) => r.match_state === "unmatched").length;
  const reviewsDuplicates = reviews.filter((r) => r.is_duplicate).length;
  const conversion =
    visitsInRange > 0 ? Math.round((reviewsCounted / visitsInRange) * 100) : null;
  // Avg rating sin contar duplicadas (las duplicadas no son del comercial en
  // términos de producción).
  const ratingReviews = reviews.filter((r) => !r.is_duplicate);
  const avgRating =
    ratingReviews.length > 0
      ? ratingReviews.reduce((s, r) => s + r.rating, 0) / ratingReviews.length
      : null;
  const firstShare = shares[0];
  const lastVisitISO = firstShare
    ? shares.reduce((max, s) => (s.opened_at > max ? s.opened_at : max), firstShare.opened_at)
    : null;
  const meta = sales.monthly_goal;
  // Solo tiene sentido comparar contra monthly_goal si el rango es un mes
  // natural completo; si no, marcamos el ratio como null y avisamos en UI.
  const pct = isMonthRange && meta > 0 ? Math.round((reviewsCounted / meta) * 100) : null;

  // Querystring para los enlaces dependientes del rango (Excel, etc.).
  const exportParams = new URLSearchParams({
    sales_id: sales.id,
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
          (sales.role === "office_director" ? "★ Director" : "Comercial") +
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
            <Link href={`/api/export/reviews?${exportParams.toString()}`} style={primaryBtn}>
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
                <DeleteSalesButton
                  id={sales.id}
                  name={sales.full_name}
                  archived={sales.status === "archived"}
                  redirectToList
                />
              </>
            )}
            {canEdit && sales.role === "office_director" && (
              // Los directores se invitan/editan/archivan/eliminan desde
              // /directores (sus actions tienen scope distinto al de sales).
              // Aquí solo se les ve como productores read-only.
              <Link href="/directores" style={linkBtn} title="Gestionar este director en /directores">
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
        {/* Cabecera con avatar */}
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

        {/* Datos editables (admin) o read-only (gestor) + KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1.2fr)",
            gap: 18,
          }}
        >
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
              initial={{
                locationId: sales.location_id,
                directorId: sales.director_id,
                monthlyGoal: sales.monthly_goal,
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <Stat
              label="Visitas al enlace"
              value={visitsInRange.toString()}
              sub={
                lastVisitISO
                  ? `Última · ${fmtDateTime(lastVisitISO)}`
                  : `${range.label}`
              }
            />
            <Stat
              label="Reseñas atribuidas"
              value={
                isMonthRange
                  ? `${reviewsCounted}/${meta}`
                  : reviewsCounted.toString()
              }
              sub={
                reviewsCounted === 0
                  ? `Sin reseñas en ${range.label}`
                  : isMonthRange
                    ? `${pct}% del objetivo · ${reviewsPending} pendientes`
                    : `${reviewsPending} pendientes · ${reviewsUnmatched} sin atribuir`
              }
              deltaTone={
                pct === null ? undefined : pct >= 100 ? "ok" : pct >= 60 ? "neutral" : "warn"
              }
              delta={pct !== null && pct > 0 ? `${pct}%` : undefined}
            />
            <Stat
              label="Conversión"
              value={conversion !== null ? `${conversion}%` : "—"}
              sub={
                conversion === null
                  ? "Sin visitas todavía"
                  : "atribuidas ÷ visitas"
              }
            />
            <Stat
              label="Valoración media"
              value={avgRating !== null ? avgRating.toFixed(2).replace(".", ",") : "—"}
              sub={
                avgRating === null
                  ? "Sin reseñas en el rango"
                  : `sobre 5 · ${reviews.length} reseñas`
              }
            />
          </div>
        </div>

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
              Visitas y reseñas del rango · {range.label}
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
                aparecerá aquí con sus visitas y reseñas asociadas.
              </div>
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
                    borderBottom: i === clients.length - 1 ? "none" : "1px solid var(--line)",
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
                      color: c.visits > 0 ? "var(--ink)" : "var(--ink-4)",
                    }}
                  >
                    {c.visits}
                  </span>
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
