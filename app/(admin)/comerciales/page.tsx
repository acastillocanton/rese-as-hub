import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProfileStatus, SalesDepartment } from "@/lib/supabase/types";
import { InviteSalesButton } from "./InviteSalesButton";
import { ArchiveSalesButton } from "./ArchiveSalesButton";
import { DeleteSalesButton } from "./DeleteSalesButton";
import { SalesFilters } from "./SalesFilters";
import { ResendAccessButton } from "@/components/ui/ResendAccessButton";
import { resendSalesAccess } from "./actions";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb } from "@/lib/branding";
import {
  commissionShortcuts,
  commissionPeriodRange,
  parseRange,
  type DateRange,
} from "@/lib/date-range";
import { RangePicker } from "@/components/ui/RangePicker";
import { Download } from "lucide-react";

const DEPARTMENTS = new Set<SalesDepartment>([
  "nacional",
  "internacional",
  "castellon",
  "valencia",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string | undefined): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
function isDepartment(v: string | undefined): v is SalesDepartment {
  return typeof v === "string" && DEPARTMENTS.has(v as SalesDepartment);
}

type SalesRow = {
  id: string;
  full_name: string;
  email: string | null;
  slug: string;
  monthly_goal: number;
  status: ProfileStatus;
  joined_at: string;
  department: SalesDepartment | null;
  language: string | null;
  director_id: string | null;
  role: "sales" | "office_director";
  avatar_url: string | null;
  location: { id: string; name: string } | null;
};

type LocationOption = { id: string; name: string };
type DirectorOption = { id: string; full_name: string; location_id: string | null };

const DEPARTMENT_LABELS: Record<SalesDepartment, string> = {
  nacional: "Nacional",
  internacional: "Internacional",
  castellon: "Castellón",
  valencia: "Valencia",
};

type PageProps = {
  searchParams: Promise<{
    status?: string;
    q?: string;
    location_id?: string;
    director_id?: string;
    department?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function ComercialesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const brand = await getCurrentUserBrand();
  const VALID_STATUSES = ["all", "invited", "active", "paused", "archived"] as const;
  const filterStatus = VALID_STATUSES.includes(sp.status as (typeof VALID_STATUSES)[number])
    ? (sp.status as string)
    : undefined;
  const showArchived = filterStatus === "archived";

  // Filtros saneados (descartamos basura para no romper la query).
  const filterLocationId = isUuid(sp.location_id) ? sp.location_id : undefined;
  const filterDirectorId = isUuid(sp.director_id) ? sp.director_id : undefined;
  const filterDepartment = isDepartment(sp.department) ? sp.department : undefined;
  // Escape %_, dentro del término — PostgREST usa ',' como separador en .or()
  // y %/_ son comodines de LIKE. Sin sanear esto abriría una inyección trivial.
  const filterQ = sp.q?.trim().replace(/[%_,]/g, "") || undefined;

  // Rango activo para la card de exportación (RangePicker en la card
  // actualiza los query params `from` y `to`, y el botón "Descargar
  // Excel" usa ese rango). Default: mes en curso.
  const exportRange = parseRange(sp.from, sp.to, new Date(), commissionPeriodRange);

  // Para el componente cliente preservamos los valores originales tal cual,
  // sin el saneo interno (igualdad ?q=… queda visible en el input).
  const currentFilters = {
    q: sp.q?.trim() || undefined,
    location_id: filterLocationId,
    director_id: filterDirectorId,
    department: filterDepartment,
    status: filterStatus,
  };

  let salesList: SalesRow[] = [];
  let locations: LocationOption[] = [];
  let directors: DirectorOption[] = [];
  let dbError: string | null = null;
  let viewerRole: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
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

    // Sin auto-join sobre profiles (PostgREST se confunde con la FK
    // auto-referencial director_id en algunos casos del schema cache).
    // Cargamos directors aparte y mergeamos en JS.
    // Mezclamos sales + office_director: el director es productor (vende y
    // tiene reseñas atribuidas), así que aparece como una fila más con un ★
    // en el nombre. Su gestión (archivar/eliminar/reenviar) vive en /directores;
    // aquí ocultamos los botones para esas filas.
    let baseQuery = supabase
      .from("profiles")
      .select(
        "id, full_name, email, slug, monthly_goal, status, joined_at, department, language, director_id, role, avatar_url, location:locations(id, name)",
      )
      .in("role", ["sales", "office_director"])
      .order("joined_at", { ascending: false });

    if (filterLocationId) baseQuery = baseQuery.eq("location_id", filterLocationId);
    if (filterDirectorId) baseQuery = baseQuery.eq("director_id", filterDirectorId);
    if (filterDepartment) baseQuery = baseQuery.eq("department", filterDepartment);
    if (filterQ) {
      baseQuery = baseQuery.or(
        `full_name.ilike.%${filterQ}%,email.ilike.%${filterQ}%,slug.ilike.%${filterQ}%`,
      );
    }

    // Filtrado por estado
    if (filterStatus && filterStatus !== "all") {
      baseQuery = baseQuery.eq("status", filterStatus);
    } else if (!filterStatus) {
      // Default: plantilla activa (todo menos archivados)
      baseQuery = baseQuery.neq("status", "archived");
    }
    // filterStatus === "all" → sin filtro

    const [salesRes, locRes, dirRes] = await Promise.all([
      baseQuery,
      supabase.from("locations").select("id, name").order("name"),
      // Directores disponibles para asignar. Excluimos archivados; el
      // selector del invite/edit los filtra después por location.
      supabase
        .from("profiles")
        .select("id, full_name, location_id")
        .eq("role", "office_director")
        .neq("status", "archived")
        .order("full_name")
        .returns<DirectorOption[]>(),
    ]);

    if (salesRes.error) dbError = salesRes.error.message;
    else salesList = ((salesRes.data ?? []) as unknown) as SalesRow[];

    if (locRes.data) locations = locRes.data as LocationOption[];
    if (dirRes.data) directors = dirRes.data;
  }

  // Admin, reviews_manager y office_director gestionan comerciales. El
  // office_director queda acotado a SU equipo (sales con director_id = él)
  // por la RLS de la migración 013 + el scope de las server actions
  // (assertSalesInScope + forzado de location/director). Ver migración 005
  // (manager) y 013 (director).
  const canEdit =
    viewerRole === "admin" ||
    viewerRole === "reviews_manager" ||
    viewerRole === "office_director";
  // El borrado PERMANENTE (deleteSales: borra profile + auth.user en cascada)
  // queda reservado a admin/manager. El director archiva (soft-delete) pero
  // no destruye historial.
  const canDelete = viewerRole === "admin" || viewerRole === "reviews_manager";
  // Para el director, ficha y director responsable se fijan a SU oficina y a
  // él mismo (el backend lo fuerza igualmente) → bloqueamos esos selectores.
  const isDirector = viewerRole === "office_director";

  // Lookup id → nombre del director para pintar la atribución en la fila
  // del comercial. Hacemos el merge en JS porque PostgREST a veces no
  // resuelve la FK auto-referencial profiles.director_id desde el select.
  const directorById = new Map(directors.map((d) => [d.id, d.full_name]));

  const STATUS_LABELS: Record<string, string> = {
    all: "Todos",
    invited: "Invitados",
    active: "Activos",
    paused: "Pausados",
    archived: "Archivados",
  };

  const stats = {
    total: salesList.length,
    active: salesList.filter((s) => s.status === "active").length,
    invited: salesList.filter((s) => s.status === "invited").length,
    paused: salesList.filter((s) => s.status === "paused").length,
  };

  return (
    <>
      <Topbar
        title="Comerciales"
        subtitle={
          filterStatus
            ? `Comerciales · ${STATUS_LABELS[filterStatus] ?? filterStatus}`
            : canEdit
              ? "Gestión de comerciales"
              : "Vista solo lectura"
        }
        range={`${salesList.length} comerciales`}
        breadcrumb={getBrandBreadcrumb(brand)}
        compact
        right={canEdit && !showArchived ? <InviteSalesButton locations={locations} directors={directors} lockScope={isDirector} /> : undefined}
      />

      <div className="m-page-pad" style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
        {dbError && (
          <Card>
            <div style={{ fontSize: 13, color: "var(--warn)", fontWeight: 500 }}>
              Error al cargar comerciales
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
        )}

        {!dbError && (
          <>
            {!showArchived && (
              <div
                className="m-stats-4"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <MiniStat label="Total" value={stats.total} sub="comerciales en plantilla" />
                <MiniStat label="Activos" value={stats.active} sub="con enlace en circulación" />
                <MiniStat label="Invitados" value={stats.invited} sub="pendientes de aceptar" />
                <MiniStat label="Pausados" value={stats.paused} sub="sin actividad reciente" />
              </div>
            )}

            {!showArchived && <ExportarResultadosCard range={exportRange} />}

            <SalesFilters
              locations={locations}
              directors={directors}
              current={currentFilters}
            />

            {salesList.length === 0 ? (
              <Card padding={32}>
                <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                  {showArchived ? "Sin comerciales archivados" : "Sin comerciales todavía"}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    marginTop: 4,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {showArchived
                    ? "Todos los comerciales están activos"
                    : canEdit
                      ? "Invita a tu primer comercial"
                      : "Aún no hay comerciales"}
                </div>
                {canEdit && !showArchived ? (
                  <>
                    <p
                      style={{
                        margin: "10px 0 16px",
                        color: "var(--ink-3)",
                        fontSize: 13.5,
                        lineHeight: 1.55,
                        maxWidth: 560,
                      }}
                    >
                      Necesitarás al menos una ficha creada para asignarle. Cuando
                      invites a alguien, te daremos un enlace de un solo uso que
                      puedes enviarle por WhatsApp o email.
                    </p>
                    <InviteSalesButton locations={locations} directors={directors} lockScope={isDirector} />
                  </>
                ) : (
                  !showArchived && (
                    <p
                      style={{
                        margin: "10px 0 0",
                        color: "var(--ink-3)",
                        fontSize: 13.5,
                        lineHeight: 1.55,
                        maxWidth: 560,
                      }}
                    >
                      Cuando el admin dé de alta comerciales aparecerán en esta
                      lista con su actividad.
                    </p>
                  )
                )}
              </Card>
            ) : (
              // En mobile la tabla tiene 6-7 columnas que no caben en <767px.
              // Permitimos scroll horizontal con un min-width que mantiene
              // legibles las filas. Para el director (uso mobile real) esto
              // basta — no llegamos a la complejidad del dual-layout sales.
              <div style={{ overflowX: "auto" }}>
                <Card padding={0}>
                  <div
                    style={{
                      padding: "12px 22px",
                      borderBottom: "1px solid var(--line)",
                      display: "grid",
                      gridTemplateColumns: canEdit
                        ? "2fr 1.1fr 1.2fr 1fr 0.8fr 0.9fr 260px"
                        : "2fr 1.1fr 1.2fr 1fr 0.8fr 0.9fr",
                      gap: 14,
                      fontSize: 11,
                      color: "var(--ink-4)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      minWidth: 780,
                    }}
                  >
                    <span>Comercial</span>
                    <span>Depto.</span>
                    <span>Ficha / Zona</span>
                    <span>Email</span>
                    <span style={{ textAlign: "right" }}>Objetivo</span>
                    <span>Estado</span>
                    {canEdit && <span></span>}
                  </div>
                  {salesList.map((s, i) => (
                    <SalesRow
                      key={s.id}
                      s={s}
                      directorName={
                        s.director_id ? directorById.get(s.director_id) ?? null : null
                      }
                      last={i === salesList.length - 1}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      archived={showArchived}
                    />
                  ))}
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function SalesRow({
  s,
  directorName,
  last,
  canEdit,
  canDelete,
  archived,
}: {
  s: SalesRow;
  directorName: string | null;
  last: boolean;
  canEdit: boolean;
  canDelete: boolean;
  archived: boolean;
}) {
  const tone =
    s.status === "active"
      ? "ok"
      : s.status === "paused"
        ? "warn"
        : s.status === "archived"
          ? "neutral"
          : "neutral";
  const label =
    s.status === "active"
      ? "Activo"
      : s.status === "paused"
        ? "Pausado"
        : s.status === "archived"
          ? "Archivado"
          : "Invitado";
  // Zona = idioma si internacional; nombre de ficha en otro caso.
  const zone =
    s.department === "internacional"
      ? s.language ?? "—"
      : s.location?.name ?? "—";
  return (
    <div
      style={{
        padding: "14px 22px",
        borderBottom: last ? "none" : "1px solid var(--line)",
        display: "grid",
        gridTemplateColumns: canEdit
          ? "2fr 1.1fr 1.2fr 1fr 0.8fr 0.9fr 260px"
          : "2fr 1.1fr 1.2fr 1fr 0.8fr 0.9fr",
        gap: 14,
        alignItems: "center",
        fontSize: 13.5,
        minWidth: 780,
      }}
    >
      <Link
        href={`/comerciales/${s.slug}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <Avatar name={s.full_name} src={s.avatar_url} size={32} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              letterSpacing: "-0.005em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "var(--ink)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
            title={s.role === "office_director" ? "Responsable de oficina (productor)" : undefined}
          >
            {s.role === "office_director" && (
              <span aria-hidden style={{ color: "var(--accent, #b8860b)", fontSize: 13 }}>★</span>
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.full_name}</span>
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              fontFamily: "var(--font-mono)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            /c/{s.slug}
          </div>
        </div>
      </Link>
      <span
        style={{
          fontSize: 12.5,
          color: s.department ? "var(--ink-2)" : "var(--ink-4)",
        }}
      >
        {s.department ? DEPARTMENT_LABELS[s.department] : "—"}
      </span>
      <div
        style={{
          fontSize: 13,
          color: "var(--ink-2)",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <span
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {zone}
        </span>
        {directorName && (
          <span
            style={{
              fontSize: 11,
              color: "var(--ink-4)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={`Responsable: ${directorName}`}
          >
            👤 {directorName}
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 12.5,
          color: "var(--ink-3)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {s.email ?? "—"}
      </span>
      <span
        style={{
          textAlign: "right",
          fontSize: 13,
          color: "var(--ink-3)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {s.monthly_goal}
      </span>
      <span>
        <Pill tone={tone} withDot>
          {label}
        </Pill>
      </span>
      {canEdit && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
          {s.role === "office_director" ? (
            // Los directores se gestionan en /directores (invitar/editar/eliminar).
            // Aquí solo se muestran como productores; el link al nombre lleva a
            // su ficha en /comerciales/[slug] (que ya acepta ambos roles).
            <Link
              href="/directores"
              style={{
                fontSize: 12,
                color: "var(--ink-4)",
                textDecoration: "none",
                padding: "6px 10px",
                border: "1px solid var(--line)",
                borderRadius: 8,
                whiteSpace: "nowrap",
              }}
              title="Gestionar este responsable en /directores"
            >
              Gestionar en /directores
            </Link>
          ) : archived ? (
            <>
              <ArchiveSalesButton id={s.id} name={s.full_name} mode="restore" />
              {/* Borrado permanente solo admin/manager (no director). */}
              {canDelete && <DeleteSalesButton id={s.id} name={s.full_name} archived />}
            </>
          ) : (
            <>
              <ResendAccessButton id={s.id} name={s.full_name} action={resendSalesAccess} />
              <ArchiveSalesButton id={s.id} name={s.full_name} />
              {canDelete && <DeleteSalesButton id={s.id} name={s.full_name} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Card de descarga rápida del parte global (4 hojas departamentales +
 * Detalle, igual que /manager/export pero condensado). El usuario
 * elige el periodo con el RangePicker (atajos mes actual / pasado /
 * último trimestre incluidos en el dropdown) y descarga con un click.
 * Para filtros avanzados (sales_id, ficha, match_state) hay un link a
 * /manager/export que ya conserva la UI completa.
 */
function ExportarResultadosCard({ range }: { range: DateRange }) {
  const shortcuts = commissionShortcuts();
  return (
    <div style={{ marginBottom: 16 }}>
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                fontWeight: 500,
              }}
            >
              Exportar resultados
            </div>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                color: "var(--ink-3)",
                lineHeight: 1.55,
              }}
            >
              Descarga el parte de reseñas con KPIs por departamento del
              periodo seleccionado. Para filtros avanzados (comercial, ficha,
              estado matching), usa la{" "}
              <Link href="/manager/export" style={{ color: "var(--ink)" }}>
                exportación personalizada
              </Link>
              .
            </p>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <RangePicker
              from={range.from}
              to={range.to}
              label={range.label}
              shortcuts={shortcuts}
            />
            <a
              href={`/api/export/reviews?from=${range.from}&to=${range.to}`}
              style={exportPrimaryBtn}
            >
              <Download size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>Descargar Excel</span>
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}

const exportPrimaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  background: "var(--ink)",
  color: "#fff",
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 500,
  textDecoration: "none",
};

function MiniStat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <Card padding={16}>
      <div
        style={{
          fontSize: 11.5,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          letterSpacing: "-0.025em",
          fontSize: 24,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--ink-4)" }}>{sub}</div>
    </Card>
  );
}

