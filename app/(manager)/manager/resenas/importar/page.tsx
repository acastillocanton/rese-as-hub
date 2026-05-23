import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

type LocationOption = { id: string; name: string };

type SalesOption = {
  id: string;
  full_name: string;
  clients: { id: string; full_name: string }[];
};

export default async function ImportarPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Importar reseña"
          subtitle="Modo demo · sin Supabase"
          breadcrumb="Reseñas"
          range={null}
        />
        <div style={{ padding: "24px 32px" }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para usar el importador.
            </div>
          </Card>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const [locationsRes, salesRes] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name")
      .order("name")
      .returns<LocationOption[]>(),
    supabase
      .from("profiles")
      .select("id, full_name, clients:clients(id, full_name)")
      .eq("role", "sales")
      .order("full_name")
      .returns<SalesOption[]>(),
  ]);

  const locations = locationsRes.data ?? [];
  const sales = salesRes.data ?? [];

  return (
    <>
      <Topbar
        title="Importar reseña"
        subtitle="Añadir manualmente una reseña a la base"
        breadcrumb="Reseñas"
        range={null}
      />

      <div
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxWidth: 820,
        }}
      >
        <Card>
          <div style={sectionLabel}>Cuándo usar este formulario</div>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13,
              color: "var(--ink-3)",
              lineHeight: 1.6,
              maxWidth: 640,
            }}
          >
            Sirve para cargar a mano una reseña visible en Google Maps que el
            sincronizador automático aún no ha traído. Útil mientras esperamos
            la aprobación de la API de Google, o cuando una ficha recibe muchas
            reseñas en un mismo día y la API solo devuelve las 5 más recientes.
            <br />
            <br />
            Si dejas la atribución en automático, el matcher buscará una visita
            de cliente al enlace personal del comercial en las 48 horas previas
            a la fecha de la reseña. Si encuentra una coincidencia clara
            (≥75%), la reseña entra como <strong>atribuida</strong>. Con
            confianza intermedia, va a <strong>Pendientes</strong>. Si no hay
            candidato razonable, queda <strong>Sin atribuir</strong>.
            <br />
            <br />
            Si ya sabes qué comercial generó la reseña, despliega
            &ldquo;Atribución manual&rdquo; abajo y forzarás la atribución
            saltándote el matcher.
          </p>
        </Card>

        {locations.length === 0 ? (
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              No hay fichas configuradas. Crea una desde{" "}
              <a href="/fichas" style={{ color: "var(--ink)" }}>
                /fichas
              </a>{" "}
              antes de importar reseñas.
            </div>
          </Card>
        ) : (
          <ImportForm locations={locations} sales={sales} />
        )}
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
