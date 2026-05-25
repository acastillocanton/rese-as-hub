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
    archived?: string;
    q?: string;
    location_id?: string;
    director_id?: string;
    department?: string;
  }>;
};

export default async function ComercialesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const showArchived = sp.archived === "1";

  // Filtros saneados (descartamos basura para no romper la query).
  const filterLocationId = isUuid(sp.location_id) ? sp.location_id : undefined;
  const filterDirectorId = isUuid(sp.director_id) ? sp.director_id : undefined;
  const filterDepartment = isDepartment(sp.department) ? sp.department : undefined;
  // Escape %_, dentro del término — PostgREST usa ',' como separador en .or()
  // y %/_ son comodines de LIKE. Sin sanear esto abriría una inyección trivial.
  const filterQ = sp.q?.trim().replace(/[%_,]/g, "") || undefined;

  // Para el componente cliente preservamos los valores originales tal cual,
  // sin el saneo interno (igualdad ?q=… queda visible en el input).
  const currentFilters = {
    q: sp.q?.trim() || undefined,
    location_id: filterLocationId,
    director_id: filterDirectorId,
    department: filterDepartment,
    archived: sp.archived,
  };

  let salesList: SalesRow[] = [];
  let archivedCount = 0;
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
    let baseQuery = supabase
      .from("profiles")
      .select(
        "id, full_name, email, slug, monthly_goal, status, joined_at, department, language, director_id, location:locations(id, name)",
      )
      .eq("role", "sales")
      .order("joined_at", { ascending: false });

    if (filterLocationId) baseQuery = baseQuery.eq("location_id", filterLocationId);
    if (filterDirectorId) baseQuery = baseQuery.eq("director_id", filterDirectorId);
    if (filterDepartment) baseQuery = baseQuery.eq("department", filterDepartment);
    if (filterQ) {
      baseQuery = baseQuery.or(
        `full_name.ilike.%${filterQ}%,email.ilike.%${filterQ}%,slug.ilike.%${filterQ}%`,
      );
    }

    const [salesRes, archivedRes, locRes, dirRes] = await Promise.all([
      showArchived
        ? baseQuery.eq("status", "archived")
        : baseQuery.neq("status", "archived"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "sales")
        .eq("status", "archived"),
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

    archivedCount = archivedRes.count ?? 0;

    if (locRes.data) locations = locRes.data as LocationOption[];
    if (dirRes.data) directors = dirRes.data;
  }

  // Admin y reviews_manager comparten plenamente la administración de
  // comerciales (invitar, editar, reenviar acceso, eliminar). Ver migración
  // 005 para las políticas RLS y assertCanManageSales en actions.ts.
  const canEdit = viewerRole === "admin" || viewerRole === "reviews_manager";

  // Lookup id → nombre del director para pintar la atribución en la fila
  // del comercial. Hacemos el merge en JS porque PostgREST a veces no
  // resuelve la FK auto-referencial profiles.director_id desde el select.
  const directorById = new Map(directors.map((d) => [d.id, d.full_name]));

  // hrefs de las pestañas Activos/Archivados que preservan los filtros
  // aplicados (oficina, director, departamento, búsqueda).
  function tabHref(toArchived: boolean): string {
    const params = new URLSearchParams();
    if (filterQ) params.set("q", filterQ);
    if (filterLocationId) params.set("location_id", filterLocationId);
    if (filterDirectorId) params.set("director_id", filterDirectorId);
    if (filterDepartment) params.set("department", filterDepartment);
    if (toArchived) params.set("archived", "1");
    const qs = params.toString();
    return qs ? `/comerciales?${qs}` : "/comerciales";
  }

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
          showArchived
            ? "Comerciales archivados"
            : canEdit
              ? "Gestión de comerciales"
              : "Vista solo lectura"
        }
        range={
          showArchived
            ? `${salesList.length} archivados`
            : `${stats.total} en plantilla`
        }
        breadcrumb="Inseryal"
        compact
        right={canEdit && !showArchived ? <InviteSalesButton locations={locations} directors={directors} /> : undefined}
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

            <SalesFilters
              locations={locations}
              directors={directors}
              current={currentFilters}
            />

            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 12,
                alignItems: "center",
              }}
            >
              <Link
                href={tabHref(false)}
                style={{
                  ...tabBtn,
                  ...(showArchived ? {} : tabBtnActive),
                }}
              >
                Activos
              </Link>
              <Link
                href={tabHref(true)}
                style={{
                  ...tabBtn,
                  ...(showArchived ? tabBtnActive : {}),
                }}
              >
                Archivados {archivedCount > 0 && `(${archivedCount})`}
              </Link>
            </div>

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
                    <InviteSalesButton locations={locations} directors={directors} />
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
  archived,
}: {
  s: SalesRow;
  directorName: string | null;
  last: boolean;
  canEdit: boolean;
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
        <Avatar name={s.full_name} size={32} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              letterSpacing: "-0.005em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "var(--ink)",
            }}
          >
            {s.full_name}
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
            title={`Director responsable: ${directorName}`}
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
          {archived ? (
            <>
              <ArchiveSalesButton id={s.id} name={s.full_name} mode="restore" />
              <DeleteSalesButton id={s.id} name={s.full_name} archived />
            </>
          ) : (
            <>
              <ResendAccessButton id={s.id} name={s.full_name} action={resendSalesAccess} />
              <ArchiveSalesButton id={s.id} name={s.full_name} />
              <DeleteSalesButton id={s.id} name={s.full_name} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

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

const tabBtn: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12.5,
  color: "var(--ink-3)",
  textDecoration: "none",
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "transparent",
};

const tabBtnActive: React.CSSProperties = {
  background: "var(--surface)",
  borderColor: "var(--line-strong)",
  color: "var(--ink)",
  fontWeight: 600,
};
