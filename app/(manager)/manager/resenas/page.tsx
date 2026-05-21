import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Stars } from "@/components/ui/Stars";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type SearchParams = Promise<{
  sales_id?: string;
  location_id?: string;
  match_state?: string;
  month?: string; // formato yyyy-mm
}>;

type SalesOption = { id: string; full_name: string; slug: string };
type LocationOption = { id: string; name: string };

type ReviewRow = {
  id: string;
  author_name: string;
  rating: number;
  text: string | null;
  google_created_at: string;
  match_state: string;
  match_confidence: number;
  sales: { full_name: string; slug: string } | null;
  client: { full_name: string } | null;
  location: { name: string } | null;
};

const MONTH_LABELS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function monthRange(monthParam: string | undefined): {
  start: string;
  end: string;
  label: string;
} {
  let year: number;
  let month: number; // 0-indexed
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m - 1;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
  }
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: `${MONTH_LABELS[month]} ${year}`,
  };
}

export default async function ManagerResenasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Reseñas"
          subtitle="Vista solo lectura"
          range="Modo demo"
          breadcrumb="Inseryal"
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
  const range = monthRange(params.month);

  let query = supabase
    .from("reviews")
    .select(
      "id, author_name, rating, text, google_created_at, match_state, match_confidence, sales:profiles!reviews_sales_id_fkey(full_name, slug), client:clients(full_name), location:locations(name)",
    )
    .gte("google_created_at", range.start)
    .lt("google_created_at", range.end)
    .order("google_created_at", { ascending: false });

  if (params.sales_id) query = query.eq("sales_id", params.sales_id);
  if (params.location_id) query = query.eq("location_id", params.location_id);
  if (params.match_state) query = query.eq("match_state", params.match_state);

  const [reviewsRes, salesRes, locationsRes] = await Promise.all([
    query.returns<ReviewRow[]>(),
    supabase
      .from("profiles")
      .select("id, full_name, slug")
      .eq("role", "sales")
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

  const counted = reviews.filter((r) => r.match_state === "counted").length;
  const pending = reviews.filter((r) => r.match_state === "pending").length;
  const unmatched = reviews.filter((r) => r.match_state === "unmatched").length;
  const avg =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2).replace(".", ",")
      : "—";

  const exportHref = new URLSearchParams();
  exportHref.set("month", params.month ?? defaultMonthParam());
  if (params.sales_id) exportHref.set("sales_id", params.sales_id);
  if (params.location_id) exportHref.set("location_id", params.location_id);
  if (params.match_state) exportHref.set("match_state", params.match_state);

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
        range={range.label}
        breadcrumb="Inseryal"
        right={
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
        {/* Filtros */}
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
            <FilterField label="Mes">
              <input
                type="month"
                name="month"
                defaultValue={params.month ?? defaultMonthParam()}
                style={inputStyle}
              />
            </FilterField>
            <FilterField label="Comercial">
              <select
                name="sales_id"
                defaultValue={params.sales_id ?? ""}
                style={inputStyle}
              >
                <option value="">Todos</option>
                {sales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
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
                <option value="">Todos</option>
                <option value="counted">Atribuidas automáticas</option>
                <option value="pending">Pendientes verificar</option>
                <option value="unmatched">Sin atribuir</option>
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
            sub={`${pending} pendientes · ${unmatched} sin atribuir`}
          />
          <MiniStat label="Valoración media" value={avg} sub={reviews.length === 0 ? "—" : "sobre 5"} />
          <MiniStat
            label="Ficha más activa"
            value={mostActiveLocation(reviews) ?? "—"}
            sub={reviews.length === 0 ? "—" : "del filtro actual"}
          />
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
              Cuando Google apruebe el acceso a la Business Profile API y el cron sincronice,
              las reseñas atribuidas aparecerán aquí. Mientras tanto puedes navegar a{" "}
              <Link href="/manager/comerciales" style={{ color: "var(--ink)" }}>
                Comerciales
              </Link>{" "}
              para revisar las visitas a enlaces.
            </p>
          </Card>
        ) : (
          <Card padding={0}>
            <div
              style={{
                padding: "12px 22px",
                borderBottom: "1px solid var(--line)",
                display: "grid",
                gridTemplateColumns: "1.4fr 1.4fr 1fr 1fr 1fr",
                gap: 14,
                fontSize: 11,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              <span>Autor / valoración</span>
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
                  gridTemplateColumns: "1.4fr 1.4fr 1fr 1fr 1fr",
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
                <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  {r.sales ? (
                    <Link
                      href={`/manager/comerciales/${r.sales.slug}`}
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
                      r.match_state === "counted"
                        ? "ok"
                        : r.match_state === "pending"
                          ? "warn"
                          : "neutral"
                    }
                    withDot
                  >
                    {r.match_state === "counted"
                      ? "Atribuida"
                      : r.match_state === "pending"
                        ? "Pendiente"
                        : "Sin atribuir"}
                  </Pill>
                  <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
                    Conf. {r.match_confidence}%
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

function defaultMonthParam(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
