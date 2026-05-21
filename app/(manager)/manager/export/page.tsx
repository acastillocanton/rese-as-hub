import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type SalesOption = { id: string; full_name: string };
type LocationOption = { id: string; name: string };

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

function ymdMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function labelMonth(d: Date) {
  return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

export default async function ManagerExportPage() {
  let sales: SalesOption[] = [];
  let locations: LocationOption[] = [];

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [salesRes, locsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "sales")
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

  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

  return (
    <>
      <Topbar
        title="Exportar Excel"
        subtitle="Parte mensual de reseñas"
        range=""
        breadcrumb="Inseryal"
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
            Una sola pulsación. Devuelve el .xlsx con todas las reseñas del mes
            seleccionado, sin filtros adicionales: dos hojas (Reseñas + Resumen
            con ranking de comerciales y fichas).
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <QuickBtn month={thisMonth} primary label={`Este mes · ${labelMonth(thisMonth)}`} />
            <QuickBtn month={lastMonth} label={`Mes anterior · ${labelMonth(lastMonth)}`} />
            <QuickBtn
              month={twoMonthsAgo}
              label={`Hace dos meses · ${labelMonth(twoMonthsAgo)}`}
            />
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
            Filtra por comercial, ficha y estado de matching antes de descargar.
          </p>
          <form action="/api/export/reviews" method="GET" style={formGrid}>
            <FilterField label="Mes">
              <input
                type="month"
                name="month"
                defaultValue={ymdMonth(thisMonth)}
                required
                style={inputStyle}
              />
            </FilterField>
            <FilterField label="Comercial">
              <select name="sales_id" defaultValue="" style={inputStyle}>
                <option value="">Todos</option>
                {sales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
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
              <strong>Hoja 1 · Reseñas</strong> — una fila por reseña con fecha,
              autor, estrellas, comentario, ficha, comercial atribuido, cliente,
              estado del matching, confianza e ID interno de Google.
            </li>
            <li>
              <strong>Hoja 2 · Resumen</strong> — totales del periodo, ranking de
              comerciales por reseñas atribuidas y ranking de fichas por volumen.
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}

function QuickBtn({
  month,
  label,
  primary,
}: {
  month: Date;
  label: string;
  primary?: boolean;
}) {
  return (
    <a
      href={`/api/export/reviews?month=${ymdMonth(month)}`}
      style={{
        padding: "9px 14px",
        background: primary ? "var(--ink)" : "var(--surface)",
        color: primary ? "#fff" : "var(--ink)",
        border: "1px solid var(--line-strong)",
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 500,
        textDecoration: "none",
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
