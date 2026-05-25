import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  thisMonthRange,
  lastMonthRange,
  lastQuarterRange,
  type DateRange,
} from "@/lib/date-range";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb } from "@/lib/branding";

type SalesOption = { id: string; full_name: string; role: "sales" | "office_director" };
type LocationOption = { id: string; name: string };

export default async function ManagerExportPage() {
  const brand = await getCurrentUserBrand();
  let sales: SalesOption[] = [];
  let locations: LocationOption[] = [];

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [salesRes, locsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["sales", "office_director"])
        .order("full_name")
        .returns<SalesOption[]>(),
      supabase
        .from("locations")
        .select("id, name")
        .order("name")
        .returns<LocationOption[]>(),
    ]);
    sales = salesRes.data ?? [];
    locations = locsRes.data ?? [];
  }

  const thisMonth = thisMonthRange();
  const lastMonth = lastMonthRange();
  const lastQuarter = lastQuarterRange();

  return (
    <>
      <Topbar
        title="Exportar Excel"
        subtitle="Parte de reseñas"
        range={null}
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
          gap: 16,
        }}
      >
        {/* Atajos */}
        <Card>
          <div style={sectionLabel}>Descargas rápidas</div>
          <p
            style={{
              margin: "10px 0 16px",
              fontSize: 13,
              color: "var(--ink-3)",
              lineHeight: 1.55,
              maxWidth: 640,
            }}
          >
            Una sola pulsación. Devuelve el .xlsx con cuatro hojas departamentales
            (Nacional · Internacional · Castellón · Valencia) reproduciendo el
            parte semanal + una hoja Detalle auditable con todas las reseñas
            individuales del periodo.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <QuickBtn range={thisMonth} primary label="Mes actual" sub={thisMonth.label} />
            <QuickBtn range={lastMonth} label="Mes pasado" sub={lastMonth.label} />
            <QuickBtn range={lastQuarter} label="Último trimestre" sub={lastQuarter.label} />
          </div>
        </Card>

        {/* Formulario personalizado */}
        <Card>
          <div style={sectionLabel}>Descarga personalizada</div>
          <p
            style={{
              margin: "10px 0 16px",
              fontSize: 13,
              color: "var(--ink-3)",
              lineHeight: 1.55,
              maxWidth: 640,
            }}
          >
            Elige un rango de fechas y filtra por comercial, ficha y estado
            de matching. Los filtros aplican solo a la hoja <strong>Detalle</strong>;
            las cuatro hojas departamentales siempre incluyen todos los comerciales.
          </p>
          <form action="/api/export/reviews" method="GET" style={formGrid}>
            <FilterField label="Desde">
              <input
                type="date"
                name="from"
                defaultValue={thisMonth.from}
                required
                style={inputStyle}
              />
            </FilterField>
            <FilterField label="Hasta">
              <input
                type="date"
                name="to"
                defaultValue={thisMonth.to}
                required
                style={inputStyle}
              />
            </FilterField>
            <FilterField label="Comercial">
              <select name="sales_id" defaultValue="" style={inputStyle}>
                <option value="">Todos</option>
                {sales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.role === "office_director" ? `★ ${s.full_name}` : s.full_name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Ficha">
              <select name="location_id" defaultValue="" style={inputStyle}>
                <option value="">Todas</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Estado matching">
              <select name="match_state" defaultValue="" style={inputStyle}>
                <option value="">Todos</option>
                <option value="counted">Atribuidas automáticas</option>
                <option value="pending">Pendientes verificar</option>
                <option value="unmatched">Sin atribuir</option>
              </select>
            </FilterField>
            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                style={{
                  padding: "9px 16px",
                  background: "var(--ink)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 9,
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Descargar Excel
              </button>
            </div>
          </form>
        </Card>

        <Card>
          <div style={sectionLabel}>Formato del archivo</div>
          <ul
            style={{
              margin: "12px 0 0",
              paddingLeft: 22,
              fontSize: 13.5,
              lineHeight: 1.65,
              color: "var(--ink-2)",
            }}
          >
            <li>
              <strong>Hojas 1–4 · Nacional / Internacional / Castellón / Valencia</strong>
              {" "}— una hoja por departamento. Cada hoja lleva el detalle por comercial
              (nombre, fecha de incorporación, zona, reseñas mes anterior, reseñas
              mes actual, notas), las filas <em>Reseñas bajas comerciales</em> y
              el total comisionado del departamento.
            </li>
            <li>
              <strong>Hoja 5 · Detalle</strong> — auditoría reseña a reseña con
              fecha, autor, estrellas, comentario, ficha, comercial atribuido,
              cliente, estado del matching, confianza e ID interno de Google.
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}

function QuickBtn({
  range,
  label,
  sub,
  primary,
}: {
  range: DateRange;
  label: string;
  sub: string;
  primary?: boolean;
}) {
  return (
    <a
      href={`/api/export/reviews?from=${range.from}&to=${range.to}`}
      style={{
        padding: "9px 14px",
        background: primary ? "var(--ink)" : "var(--surface)",
        color: primary ? "#fff" : "var(--ink)",
        border: "1px solid var(--line-strong)",
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 500,
        textDecoration: "none",
        display: "inline-flex",
        flexDirection: "column",
        gap: 2,
        lineHeight: 1.3,
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 400,
          opacity: 0.75,
        }}
      >
        {sub}
      </span>
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

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 14,
  maxWidth: 640,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  fontSize: 13.5,
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
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
