import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Stars } from "@/components/ui/Stars";
import { Pill } from "@/components/ui/Pill";
import { DuplicateBadge } from "@/components/ui/DuplicateBadge";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseRange, commissionShortcuts, commissionPeriodRange } from "@/lib/date-range";
import { RangePicker } from "@/components/ui/RangePicker";
import { SyncNowButton } from "@/components/ui/SyncNowButton";
import { RemovalControls } from "@/components/ui/RemovalControls";
import { GoogleReviewLink } from "@/components/ui/GoogleReviewLink";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb } from "@/lib/branding";

type SearchParams = Promise<{
  sales_id?: string;
  location_id?: string;
  match_state?: string;
  duplicates?: string;
  /** Filtro "rating bajo": entero 1-5. Si vale 2, devuelve sólo reseñas
   *  con rating <= 2. Usado por el banner ≤2★ del dashboard que enlaza
   *  aquí con `?rating_lte=2`. */
  rating_lte?: string;
  from?: string;
  to?: string;
}>;

type SalesOption = { id: string; full_name: string; slug: string; role: "sales" | "office_director" };
type LocationOption = { id: string; name: string };

type ReviewRow = {
  id: string;
  author_name: string;
  rating: number;
  text: string | null;
  google_created_at: string;
  match_state: string;
  match_confidence: number;
  removed_at: string | null;
  is_duplicate: boolean;
  google_maps_url: string | null;
  sales: { full_name: string; slug: string } | null;
  client: { full_name: string } | null;
  location: { name: string; google_place_id: string | null } | null;
};

export default async function ManagerResenasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const brand = await getCurrentUserBrand();

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Reseñas"
          subtitle="Vista solo lectura"
          range="Modo demo"
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
  const range = parseRange(params.from, params.to, new Date(), commissionPeriodRange);

  // El filtro "removed" es una pseudo-categoría dentro de match_state: si el
  // usuario lo elige, mostramos solo eliminadas y no filtramos por match
  // real. En el resto de casos, filtramos por removed_at IS NULL como en el
  // resto de pantallas.
  const showRemoved = params.match_state === "removed";

  let query = supabase
    .from("reviews")
    .select(
      "id, author_name, rating, text, google_created_at, match_state, match_confidence, removed_at, is_duplicate, google_maps_url, sales:profiles!reviews_sales_id_fkey(full_name, slug), client:clients(full_name), location:locations(name, google_place_id)",
    )
    .gte("google_created_at", range.startIso)
    .lt("google_created_at", range.endIso)
    .order("google_created_at", { ascending: false });

  if (showRemoved) {
    query = query.not("removed_at", "is", null);
  } else {
    query = query.is("removed_at", null);
    if (params.match_state) query = query.eq("match_state", params.match_state);
  }

  if (params.sales_id) query = query.eq("sales_id", params.sales_id);
  if (params.location_id) query = query.eq("location_id", params.location_id);
  // Filtro duplicadas (mig 015):
  //   - "yes" → solo is_duplicate=true
  //   - "no"  → solo is_duplicate=false (principales)
  //   - sin valor → sin filtro (mezcla)
  if (params.duplicates === "yes") query = query.eq("is_duplicate", true);
  else if (params.duplicates === "no") query = query.eq("is_duplicate", false);
  // Filtro rating bajo (banner ≤2★ del dashboard):
  //   - rating_lte=N (1-5) → reseñas con rating <= N.
  //   - Si N inválido, ignoramos (no rompemos la query).
  const ratingLteNum =
    params.rating_lte && /^[1-5]$/.test(params.rating_lte)
      ? parseInt(params.rating_lte, 10)
      : null;
  if (ratingLteNum !== null) query = query.lte("rating", ratingLteNum);

  const [reviewsRes, salesRes, locationsRes] = await Promise.all([
    // Límite defensivo: evita traer un volumen sin tope si el rango/filtro es
    // amplio. 1000 cubre cualquier periodo real de gestión con holgura.
    query.limit(1000).returns<ReviewRow[]>(),
    supabase
      .from("profiles")
      .select("id, full_name, slug, role")
      .in("role", ["sales", "office_director"])
      .order("full_name")
      .returns<SalesOption[]>(),
    supabase
      .from("locations")
      .select("id, name")
      .order("name")
      .returns<LocationOption[]>(),
  ]);

  const reviews = reviewsRes.data ?? [];
  const sales = salesRes.data ?? [];
  const locations = locationsRes.data ?? [];

  // Atribuidas / pendientes / sin atribuir cuentan SOLO principales (anti-fraude
  // mig 015) para coherencia con el resto de KPIs. Las duplicadas se reportan
  // en su contador propio.
  const counted = reviews.filter(
    (r) => r.match_state === "counted" && !r.is_duplicate,
  ).length;
  const pending = reviews.filter(
    (r) => r.match_state === "pending" && !r.is_duplicate,
  ).length;
  const unmatched = reviews.filter((r) => r.match_state === "unmatched").length;
  const duplicates = reviews.filter((r) => r.is_duplicate).length;
  const avg =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2).replace(".", ",")
      : "—";

  const exportHref = new URLSearchParams();
  exportHref.set("from", range.from);
  exportHref.set("to", range.to);
  if (params.sales_id) exportHref.set("sales_id", params.sales_id);
  if (params.location_id) exportHref.set("location_id", params.location_id);
  if (params.match_state) exportHref.set("match_state", params.match_state);
  if (params.duplicates) exportHref.set("duplicates", params.duplicates);

  const shortcuts = commissionShortcuts();

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <>
      <Topbar
        title="Reseñas"
        subtitle="Vista solo lectura"
        range={null}
        breadcrumb={getBrandBreadcrumb(brand)}
        right={
          <>
            <SyncNowButton label="Sincronizar" variant="ghost" />
            <RangePicker
              from={range.from}
              to={range.to}
              label={range.label}
              shortcuts={shortcuts}
            />
            <a
              href={`/api/export/reviews?${exportHref.toString()}`}
              style={{
                padding: "7px 12px",
                background: "var(--ink)",
                color: "#fff",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Descargar Excel
            </a>
          </>
        }
      />

      <div
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Filtros adicionales — el rango se elige desde el RangePicker del
            topbar. Aquí solo viven los selects que dependen de catálogo. Se
            mantiene un hidden con from/to para que el submit conserve el
            periodo activo. */}
        <Card>
          <form
            method="GET"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
              gap: 12,
              alignItems: "end",
            }}
          >
            <input type="hidden" name="from" value={range.from} />
            <input type="hidden" name="to" value={range.to} />
            <FilterField label="Comercial">
              <select
                name="sales_id"
                defaultValue={params.sales_id ?? ""}
                style={inputStyle}
              >
                <option value="">Todos</option>
                {sales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.role === "office_director" ? `★ ${s.full_name}` : s.full_name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Ficha">
              <select
                name="location_id"
                defaultValue={params.location_id ?? ""}
                style={inputStyle}
              >
                <option value="">Todas</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Estado matching">
              <select
                name="match_state"
                defaultValue={params.match_state ?? ""}
                style={inputStyle}
              >
                <option value="">Todos (sin eliminadas)</option>
                <option value="counted">Atribuidas automáticas</option>
                <option value="pending">Pendientes verificar</option>
                <option value="unmatched">Sin atribuir</option>
                <option value="removed">Eliminadas en Google</option>
              </select>
            </FilterField>
            <FilterField label="Duplicadas">
              <select
                name="duplicates"
                defaultValue={params.duplicates ?? ""}
                style={inputStyle}
              >
                <option value="">Mezcla (todas)</option>
                <option value="no">Solo principales</option>
                <option value="yes">Solo duplicadas</option>
              </select>
            </FilterField>
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
              }}
            >
              Filtrar
            </button>
          </form>
        </Card>

        {/* Resumen */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
          }}
        >
          <MiniStat label="Reseñas" value={reviews.length.toString()} sub={range.label} />
          <MiniStat
            label="Atribuidas"
            value={counted.toString()}
            sub={
              duplicates > 0
                ? `${pending} pendientes · ${unmatched} sin atribuir · ${duplicates} duplicadas`
                : `${pending} pendientes · ${unmatched} sin atribuir`
            }
          />
          <MiniStat label="Valoración media" value={avg} sub={reviews.length === 0 ? "—" : "sobre 5"} />
          {params.location_id ? (
            // Cuando hay filtro de ficha aplicado, "Ficha más activa" pierde
            // sentido (trivialmente sería la única filtrada). Mostramos en
            // su lugar un KPI sí útil: % de reseñas con texto (cliente
            // dejó comentario además de las estrellas).
            (() => {
              const withText = reviews.filter((r) => r.text && r.text.trim() !== "").length;
              const pct = reviews.length > 0
                ? Math.round((withText / reviews.length) * 100)
                : 0;
              return (
                <MiniStat
                  label="Con comentario"
                  value={reviews.length === 0 ? "—" : `${pct}%`}
                  sub={
                    reviews.length === 0
                      ? "—"
                      : `${withText} de ${reviews.length} dejaron texto`
                  }
                />
              );
            })()
          ) : (
            <MiniStat
              label="Ficha más activa"
              value={mostActiveLocation(reviews) ?? "—"}
              sub={reviews.length === 0 ? "—" : "del filtro actual"}
            />
          )}
        </div>

        {/* Lista */}
        {reviews.length === 0 ? (
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
              No hay reseñas en {range.label} con esos filtros
            </div>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 13,
                color: "var(--ink-3)",
                lineHeight: 1.55,
                maxWidth: 640,
              }}
            >
              Cuando entren reseñas nuevas vía cron (Places API hoy, Business
              Profile cuando llegue cuota), aparecerán aquí. Si esperabas ver
              alguna concreta, revisa el{" "}
              <Link href="/dashboard" style={{ color: "var(--ink)" }}>
                Dashboard
              </Link>{" "}
              para el banner de alertas.
            </p>
          </Card>
        ) : (
          <Card padding={0}>
            <div
              style={{
                padding: "12px 22px",
                borderBottom: "1px solid var(--line)",
                display: "grid",
                gridTemplateColumns: "1.4fr 0.5fr 1.4fr 1fr 1fr 1fr",
                gap: 14,
                fontSize: 11,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              <span>Autor / valoración</span>
              <span>Google</span>
              <span>Comercial / cliente</span>
              <span>Ficha</span>
              <span>Fecha</span>
              <span>Estado matching</span>
            </div>
            {reviews.map((r, i) => (
              <div
                key={r.id}
                style={{
                  padding: "14px 22px",
                  borderBottom: i === reviews.length - 1 ? "none" : "1px solid var(--line)",
                  display: "grid",
                  gridTemplateColumns: "1.4fr 0.5fr 1.4fr 1fr 1fr 1fr",
                  gap: 14,
                  alignItems: "start",
                  fontSize: 13,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Stars value={r.rating} size={11} />
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 4, letterSpacing: "-0.005em" }}>
                    {r.author_name}
                  </div>
                  {r.text && (
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        color: "var(--ink-3)",
                      }}
                    >
                      {r.text.length > 220 ? `${r.text.slice(0, 220)}…` : r.text}
                    </p>
                  )}
                </div>
                <div>
                  <GoogleReviewLink placeId={r.location?.google_place_id} mapsUrl={r.google_maps_url} variant="compact" />
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  {r.sales ? (
                    <Link
                      href={`/comerciales/${r.sales.slug}`}
                      style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 600 }}
                    >
                      {r.sales.full_name}
                    </Link>
                  ) : (
                    <span style={{ color: "var(--ink-4)" }}>Sin atribuir</span>
                  )}
                  {r.client && (
                    <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--ink-4)" }}>
                      Cliente: {r.client.full_name}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                  {r.location?.name ?? "—"}
                </span>
                <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
                  {fmtDateTime(r.google_created_at)}
                </span>
                <div>
                  <Pill
                    tone={
                      r.removed_at
                        ? "neutral"
                        : r.match_state === "counted"
                          ? "ok"
                          : r.match_state === "pending"
                            ? "warn"
                            : "neutral"
                    }
                    withDot
                  >
                    {r.removed_at
                      ? "Eliminada"
                      : r.match_state === "counted"
                        ? "Atribuida"
                        : r.match_state === "pending"
                          ? "Pendiente"
                          : "Sin atribuir"}
                  </Pill>
                  {r.is_duplicate && (
                    <div style={{ marginTop: 4 }}>
                      <DuplicateBadge />
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
                    Conf. {r.match_confidence}%
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <RemovalControls reviewId={r.id} removedAt={r.removed_at} size="sm" />
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}

function mostActiveLocation(reviews: ReviewRow[]): string | null {
  if (reviews.length === 0) return null;
  const counts = new Map<string, number>();
  for (const r of reviews) {
    const name = r.location?.name;
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let topName: string | null = null;
  let topCount = 0;
  for (const [name, count] of counts) {
    if (count > topCount) {
      topName = name;
      topCount = count;
    }
  }
  return topName;
}

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--surface)",
  color: "var(--ink)",
  width: "100%",
};

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

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
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
