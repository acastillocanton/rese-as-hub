import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ReviewVerificationRow } from "./ReviewVerificationRow";
import { Pagination } from "@/components/ui/Pagination";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb } from "@/lib/branding";
import { getRoleScope } from "@/lib/auth/role-scope";
import type { Role } from "@/lib/supabase/types";

type SearchParams = Promise<{
  state?: string;
  page?: string;
  /** Búsqueda por nombre del autor de Google (ilike). */
  q?: string;
  location_id?: string;
  sales_id?: string;
  /** Valoración exacta 1-5. */
  rating?: string;
  /** Rango de fechas OPCIONAL (yyyy-mm-dd) sobre google_created_at. Vacío =
   *  todas (la bandeja es histórica; no imponemos un periodo por defecto para
   *  no ocultar reseñas antiguas). */
  from?: string;
  to?: string;
}>;

type LocationOption = { id: string; name: string };

/**
 * Reseñas por página. La bandeja se pagina server-side: la pestaña
 * "Atribuidas" puede tener cientos de reseñas y renderizarlas todas de golpe
 * bloqueaba la navegación cliente (misma-ruta, sin loading.tsx → la
 * transición no hacía commit y la pestaña "no abría"). Mismo patrón que
 * /resenas/respuestas.
 */
const PAGE_SIZE = 25;

type ReviewRow = {
  id: string;
  author_name: string;
  rating: number;
  text: string | null;
  google_created_at: string;
  match_state: string;
  match_confidence: number;
  match_evidence: Record<string, unknown> | null;
  removed_at: string | null;
  is_duplicate: boolean;
  google_maps_url: string | null;
  sales: { id: string; full_name: string; slug: string } | null;
  client: { id: string; full_name: string } | null;
  location: { id: string; name: string; google_place_id: string | null } | null;
};

type SalesOptionWithDirector = {
  id: string;
  full_name: string;
  slug: string;
  role: "sales" | "office_director";
  director_id: string | null;
  clients: { id: string; full_name: string }[];
};

export type SalesOption = {
  id: string;
  full_name: string;
  slug: string;
  role: "sales" | "office_director";
  clients: { id: string; full_name: string }[];
};

export default async function ResenasVerificacionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const brand = await getCurrentUserBrand();
  // El default state depende del rol: el sales solo trabaja con huérfanas,
  // así que entra directamente a "unmatched". El resto (admin/manager/director)
  // entra a "pending" porque su trabajo principal es validar propuestas del
  // matcher. Necesitamos resolver el rol antes; lo hacemos abajo y derivamos
  // el stateFilter después.
  const explicitState =
    params.state === "unmatched"
      ? ("unmatched" as const)
      : params.state === "pending"
        ? ("pending" as const)
        : params.state === "removed"
          ? ("removed" as const)
          : params.state === "counted"
            ? ("counted" as const)
            : null;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Verificación"
          subtitle="Modo demo · sin Supabase"
          breadcrumb={getBrandBreadcrumb(brand)}
        />
        <div style={{ padding: "24px 32px" }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para ver reseñas reales.
            </div>
          </Card>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const scope = await getRoleScope(supabase);
  const viewerRole = (scope.role ?? "sales") as Role;
  const viewerId = scope.userId ?? "";
  const isSalesViewer = viewerRole === "sales";

  // Resolver state filter ahora que conocemos el rol.
  const stateFilter: "pending" | "unmatched" | "removed" | "counted" =
    explicitState ?? (isSalesViewer ? "unmatched" : "pending");

  // Página actual (1-based). Cambiar de pestaña omite `page` en el href → se
  // vuelve a página 1 (los FilterChip no lo arrastran).
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const rangeStart = (page - 1) * PAGE_SIZE;

  // --- Filtros de búsqueda (aplican DENTRO de la pestaña activa) ---
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const q = (params.q ?? "").trim();
  const rating =
    params.rating && /^[1-5]$/.test(params.rating)
      ? Number.parseInt(params.rating, 10)
      : null;
  const locationId =
    params.location_id && uuidRe.test(params.location_id) ? params.location_id : null;
  const salesId =
    params.sales_id && uuidRe.test(params.sales_id) ? params.sales_id : null;
  const fromDate = params.from && dateRe.test(params.from) ? params.from : null;
  const toDate = params.to && dateRe.test(params.to) ? params.to : null;
  const hasFilters =
    q !== "" ||
    rating !== null ||
    locationId !== null ||
    salesId !== null ||
    fromDate !== null ||
    toDate !== null;

  // Paginación server-side + filtros. `count: "exact"` devuelve el total que
  // casa con los filtros (ignora el .range), justo lo que necesita el
  // paginador. Orden por más reciente → una reseña recién mal atribuida sale
  // arriba. Sustituye al viejo `.limit(500)` que renderizaba cientos de
  // tarjetas de golpe (§ bug de la pestaña Atribuidas que "no abría").
  // Filtros: se aplican a la query de LISTA y a la de CONTEO (paginación).
  // ⚠️ El conteo va en una query APARTE con `count: "exact"`. NO ponemos
  // `count: "exact"` en la query de la lista: hacerlo rompía el commit de la
  // navegación cliente entre páginas del mismo segmento (el RSC llega 200
  // pero React no aplicaba el resultado → la página "no cambiaba"). Con el
  // conteo separado, la lista vuelve a navegar al instante.
  // Los filtros se aplican dos veces (lista + conteo): mantener en sync.
  let listQuery = supabase
    .from("reviews")
    .select(
      "id, author_name, rating, text, google_created_at, match_state, match_confidence, match_evidence, removed_at, is_duplicate, google_maps_url, sales:profiles!reviews_sales_id_fkey(id, full_name, slug), client:clients(id, full_name), location:locations(id, name, google_place_id)",
    );
  let countQuery = supabase
    .from("reviews")
    .select("id", { count: "exact", head: true });

  if (stateFilter === "removed") {
    listQuery = listQuery.not("removed_at", "is", null);
    countQuery = countQuery.not("removed_at", "is", null);
  } else {
    listQuery = listQuery.eq("match_state", stateFilter).is("removed_at", null);
    countQuery = countQuery.eq("match_state", stateFilter).is("removed_at", null);
  }
  if (q) {
    listQuery = listQuery.ilike("author_name", `%${q}%`);
    countQuery = countQuery.ilike("author_name", `%${q}%`);
  }
  if (locationId) {
    listQuery = listQuery.eq("location_id", locationId);
    countQuery = countQuery.eq("location_id", locationId);
  }
  if (salesId) {
    listQuery = listQuery.eq("sales_id", salesId);
    countQuery = countQuery.eq("sales_id", salesId);
  }
  if (rating !== null) {
    listQuery = listQuery.eq("rating", rating);
    countQuery = countQuery.eq("rating", rating);
  }
  if (fromDate) {
    listQuery = listQuery.gte("google_created_at", `${fromDate}T00:00:00.000Z`);
    countQuery = countQuery.gte("google_created_at", `${fromDate}T00:00:00.000Z`);
  }
  if (toDate) {
    listQuery = listQuery.lte("google_created_at", `${toDate}T23:59:59.999Z`);
    countQuery = countQuery.lte("google_created_at", `${toDate}T23:59:59.999Z`);
  }

  const reviewsPage = listQuery
    .order("google_created_at", { ascending: false })
    .range(rangeStart, rangeStart + PAGE_SIZE - 1);

  const [
    reviewsRes,
    filteredCountRes,
    pendingCountRes,
    unmatchedCountRes,
    removedCountRes,
    countedCountRes,
    salesWithClientsRes,
    locationsRes,
  ] = await Promise.all([
    reviewsPage.returns<ReviewRow[]>(),
    countQuery,
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("match_state", "pending")
      .is("removed_at", null),
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("match_state", "unmatched")
      .is("removed_at", null),
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .not("removed_at", "is", null),
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("match_state", "counted")
      .is("removed_at", null),
    supabase
      .from("profiles")
      .select("id, full_name, slug, role, director_id, clients:clients(id, full_name)")
      .in("role", ["sales", "office_director"])
      .order("full_name")
      .returns<SalesOptionWithDirector[]>(),
    supabase
      .from("locations")
      .select("id, name")
      .order("name")
      .returns<LocationOption[]>(),
  ]);

  const reviews = reviewsRes.data ?? [];
  const pendingCount = pendingCountRes.count ?? 0;
  const unmatchedCount = unmatchedCountRes.count ?? 0;
  const removedCount = removedCountRes.count ?? 0;
  const countedCount = countedCountRes.count ?? 0;
  const allSalesOptions = salesWithClientsRes.data ?? [];
  const locations = locationsRes.data ?? [];

  // Total de la pestaña activa YA filtrado (para la paginación), desde la
  // query de conteo separada. Los contadores de las pestañas (chips) siguen
  // siendo el total sin filtrar.
  const filteredTotal = filteredCountRes.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  // Filtrado de salesOptions según rol del viewer:
  //  • sales            → solo su propio profile (con sus clientes).
  //  • office_director  → su equipo (director_id === viewerId) + él mismo.
  //  • admin / manager  → todos.
  const salesOptions: SalesOption[] = (() => {
    if (viewerRole === "sales") {
      return allSalesOptions
        .filter((s) => s.id === viewerId)
        .map(({ director_id: _, ...rest }) => rest);
    }
    if (viewerRole === "office_director") {
      return allSalesOptions
        .filter((s) => s.id === viewerId || s.director_id === viewerId)
        .map(({ director_id: _, ...rest }) => rest);
    }
    return allSalesOptions.map(({ director_id: _, ...rest }) => rest);
  })();

  // Href que preserva estado + filtros activos y solo cambia `page`. Lo usa el
  // paginador (Prev/Next). Los FilterChip NO lo usan → cambiar de pestaña
  // resetea los filtros (comportamiento predecible). `target === 1` omite page.
  const buildHref = (target: number) => {
    const sp = new URLSearchParams();
    sp.set("state", stateFilter);
    if (q) sp.set("q", q);
    if (locationId) sp.set("location_id", locationId);
    if (salesId) sp.set("sales_id", salesId);
    if (rating !== null) sp.set("rating", String(rating));
    if (fromDate) sp.set("from", fromDate);
    if (toDate) sp.set("to", toDate);
    if (target > 1) sp.set("page", String(target));
    return `/resenas/verificacion?${sp.toString()}`;
  };

  return (
    <>
      <Topbar
        title="Verificación"
        subtitle={
          isSalesViewer
            ? "Reseñas huérfanas de tu ficha"
            : "Bandeja de matching dudoso"
        }
        range={
          stateFilter === "pending"
            ? `${pendingCount} pendientes`
            : stateFilter === "unmatched"
              ? `${unmatchedCount} sin atribuir`
              : stateFilter === "counted"
                ? `${countedCount} atribuidas`
                : `${removedCount} eliminadas`
        }
        breadcrumb={getBrandBreadcrumb(brand)}
        compact
      />

      <div
        className="m-page-pad"
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <Card>
          <div style={sectionLabel}>Cómo usar esta bandeja</div>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13,
              color: "var(--ink-3)",
              lineHeight: 1.55,
              maxWidth: 640,
            }}
          >
            {isSalesViewer ? (
              <>
                Aquí aparecen las reseñas <strong>huérfanas</strong> de tu
                ficha — las que dejaron clientes sin pasar por tu enlace
                personal y no las pudimos atribuir automáticamente. Si
                reconoces al cliente que la dejó, pulsa{" "}
                <strong>&ldquo;Es mía&rdquo;</strong> para atribuirla a tu
                cuenta. Si no la reconoces, déjala — un compañero o el gestor
                podrá identificarla.
              </>
            ) : (
              <>
                Las reseñas <strong>Pendientes</strong> tienen una propuesta del matcher
                con confianza entre 40% y 75% — el algoritmo cree saber quién las
                generó pero no se atreve a contabilizar sin tu confirmación. Las{" "}
                <strong>Sin atribuir</strong> no encontraron candidato razonable;
                úsalas para reasignar manualmente si reconoces al cliente. En{" "}
                <strong>Atribuidas</strong> tienes las ya contabilizadas: entra ahí si
                una se asignó al comercial equivocado y pulsa &ldquo;Reasignar&rdquo; para
                moverla al correcto.
              </>
            )}
          </p>
        </Card>

        {/* Pestañas: el sales solo trabaja con "Sin atribuir" — ocultamos
            Pendientes (nunca le va a tocar validar matches dudosos del
            matcher: o son suyas directas, o son huérfanas) y Eliminadas
            (no puede gestionarlas). */}
        {!isSalesViewer && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <FilterChip
              href="/resenas/verificacion?state=pending"
              label={`Pendientes (${pendingCount})`}
              active={stateFilter === "pending"}
              tone="warn"
            />
            <FilterChip
              href="/resenas/verificacion?state=unmatched"
              label={`Sin atribuir (${unmatchedCount})`}
              active={stateFilter === "unmatched"}
              tone="neutral"
            />
            <FilterChip
              href="/resenas/verificacion?state=counted"
              label={`Atribuidas (${countedCount})`}
              active={stateFilter === "counted"}
              tone="neutral"
            />
            <FilterChip
              href="/resenas/verificacion?state=removed"
              label={`Eliminadas (${removedCount})`}
              active={stateFilter === "removed"}
              tone="neutral"
            />
          </div>
        )}

        {/* Filtros de búsqueda. Se aplican dentro de la pestaña activa; el
            submit conserva `state` (hidden) y resetea a página 1 (no incluye
            page). No se muestran al sales (su bandeja de huérfanas es pequeña). */}
        {!isSalesViewer && (
          <Card>
            <form
              method="GET"
              style={{
                display: "grid",
                gridTemplateColumns: showsComercialFilter(stateFilter)
                  ? "1.6fr 1fr 1fr 0.9fr 1fr 1fr auto"
                  : "1.8fr 1fr 0.9fr 1fr 1fr auto",
                gap: 12,
                alignItems: "end",
              }}
            >
              <input type="hidden" name="state" value={stateFilter} />
              <FilterField label="Buscar por nombre">
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Nombre del autor en Google"
                  style={fieldInputStyle}
                />
              </FilterField>
              <FilterField label="Ficha">
                <select name="location_id" defaultValue={locationId ?? ""} style={fieldInputStyle}>
                  <option value="">Todas</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </FilterField>
              {showsComercialFilter(stateFilter) && (
                <FilterField label="Comercial">
                  <select name="sales_id" defaultValue={salesId ?? ""} style={fieldInputStyle}>
                    <option value="">Todos</option>
                    {salesOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.role === "office_director" ? `★ ${s.full_name}` : s.full_name}
                      </option>
                    ))}
                  </select>
                </FilterField>
              )}
              <FilterField label="Valoración">
                <select
                  name="rating"
                  defaultValue={rating !== null ? String(rating) : ""}
                  style={fieldInputStyle}
                >
                  <option value="">Todas</option>
                  <option value="5">5 ★</option>
                  <option value="4">4 ★</option>
                  <option value="3">3 ★</option>
                  <option value="2">2 ★</option>
                  <option value="1">1 ★</option>
                </select>
              </FilterField>
              <FilterField label="Desde">
                <input type="date" name="from" defaultValue={fromDate ?? ""} style={fieldInputStyle} />
              </FilterField>
              <FilterField label="Hasta">
                <input type="date" name="to" defaultValue={toDate ?? ""} style={fieldInputStyle} />
              </FilterField>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="submit"
                  style={{
                    padding: "7px 14px",
                    background: "var(--ink)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Filtrar
                </button>
                {hasFilters && (
                  <a
                    href={`/resenas/verificacion?state=${stateFilter}`}
                    style={{ fontSize: 12.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}
                  >
                    Limpiar
                  </a>
                )}
              </div>
            </form>
          </Card>
        )}

        {reviews.length === 0 && hasFilters ? (
          <Card padding={32}>
            <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
              Sin resultados
            </div>
            <div
              style={{ fontSize: 20, fontWeight: 600, marginTop: 4, letterSpacing: "-0.02em" }}
            >
              Ninguna reseña coincide con la búsqueda
            </div>
            <p
              style={{
                margin: "10px 0 0",
                color: "var(--ink-3)",
                fontSize: 13.5,
                lineHeight: 1.55,
                maxWidth: 560,
              }}
            >
              Prueba a ampliar los filtros o{" "}
              <a href={`/resenas/verificacion?state=${stateFilter}`} style={{ color: "var(--ink)" }}>
                límpialos
              </a>{" "}
              para ver todas las de esta pestaña.
            </p>
          </Card>
        ) : reviews.length === 0 ? (
          <Card padding={32}>
            <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
              {stateFilter === "pending"
                ? "Bandeja vacía"
                : stateFilter === "unmatched"
                  ? isSalesViewer
                    ? "Sin huérfanas en tu ficha"
                    : "Sin reseñas no atribuidas"
                  : stateFilter === "counted"
                    ? "Sin reseñas atribuidas"
                    : "Sin reseñas eliminadas"}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                marginTop: 4,
                letterSpacing: "-0.02em",
              }}
            >
              {stateFilter === "pending"
                ? "Todo en orden por aquí"
                : stateFilter === "unmatched"
                  ? isSalesViewer
                    ? "Nada que reclamar"
                    : "Cero reseñas huérfanas"
                  : stateFilter === "counted"
                    ? "Todavía nada atribuido"
                    : "Ninguna eliminación detectada"}
            </div>
            <p
              style={{
                margin: "10px 0 0",
                color: "var(--ink-3)",
                fontSize: 13.5,
                lineHeight: 1.55,
                maxWidth: 560,
              }}
            >
              {isSalesViewer ? (
                "Ahora mismo no hay reseñas huérfanas pendientes de identificar en tu ficha. Vuelve a esta sección cuando recibas una notificación o sospeches que alguna reseña de Google no entró por tu enlace."
              ) : (
                <>
                  {stateFilter === "pending"
                    ? "Cuando el cron sincronice una reseña con confianza intermedia, aparecerá aquí para que decidas. Mientras tanto puedes revisar las reseñas "
                    : stateFilter === "unmatched"
                      ? "El matcher ha encontrado un candidato razonable para todas las reseñas sincronizadas. Si crees que hay alguna mal asignada, revisa la pestaña "
                      : stateFilter === "counted"
                        ? "Todavía no hay ninguna reseña atribuida. Cuando se contabilice alguna, aparecerá aquí y podrás reasignarla si fue al comercial equivocado. De momento revisa las "
                        : "Cuando el cron de Places API note que una reseña ya no aparece en Google, se marcará aquí automáticamente. También puedes marcarla a mano desde las pestañas "}
                  <a
                    href={
                      stateFilter === "pending"
                        ? "/resenas/verificacion?state=unmatched"
                        : "/resenas/verificacion?state=pending"
                    }
                    style={{ color: "var(--ink)" }}
                  >
                    {stateFilter === "pending" ? "sin atribuir" : "pendientes"}
                  </a>
                  .
                </>
              )}
            </p>
          </Card>
        ) : (
          reviews.map((r) => (
            <ReviewVerificationRow
              key={r.id}
              review={r}
              salesOptions={salesOptions}
              viewerRole={viewerRole}
              viewerId={viewerId}
            />
          ))
        )}

        {filteredTotal > 0 && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={filteredTotal}
            totalPages={totalPages}
            hrefForPage={buildHref}
            hardNav
          />
        )}
      </div>
    </>
  );
}

function FilterChip({
  href,
  label,
  active,
  tone,
}: {
  href: string;
  label: string;
  active: boolean;
  tone: "warn" | "neutral";
}) {
  const activeBg = tone === "warn" ? "var(--warn-bg)" : "rgba(0,0,0,0.05)";
  const activeColor = tone === "warn" ? "var(--warn)" : "var(--ink)";
  return (
    // `<a>` (carga completa) en vez de <Link>: la navegación cliente de Next
    // entre pestañas (misma ruta, solo cambia ?state) NO hacía commit en el
    // build de producción con esta lista pesada → la pestaña "no abría". La
    // carga completa siempre navega. (En dev sí commitaba, por eso no se veía
    // en local con `npm run dev`.)
    <a
      href={href}
      style={{
        padding: "6px 12px",
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 500,
        textDecoration: "none",
        background: active ? activeBg : "var(--surface)",
        color: active ? activeColor : "var(--ink-3)",
        border: "1px solid var(--line-strong)",
      }}
    >
      {label}
    </a>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--ink-4)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 600,
};

/**
 * El filtro por comercial solo aplica a reseñas que tienen comercial
 * atribuido (counted/pending). En "unmatched" y "removed" el sales_id suele
 * ser null, así que ocultamos ese select para no confundir.
 */
function showsComercialFilter(
  state: "pending" | "unmatched" | "removed" | "counted",
): boolean {
  return state === "counted" || state === "pending";
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const fieldInputStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--surface)",
  color: "var(--ink)",
  width: "100%",
};
