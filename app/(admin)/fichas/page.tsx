import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { OauthStatus } from "@/lib/supabase/types";
import { AddFichaButton } from "./AddFichaButton";
import { DeleteFichaButton } from "./DeleteFichaButton";

type LocationRow = {
  id: string;
  name: string;
  google_place_id: string | null;
  oauth_status: OauthStatus;
  created_at: string;
};

export default async function FichasPage() {
  let locations: LocationRow[] = [];
  let dbError: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, google_place_id, oauth_status, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      dbError = error.message;
    } else {
      locations = (data ?? []) as LocationRow[];
    }
  }

  return (
    <>
      <Topbar
        title="Fichas Google"
        subtitle="Fichas de Google Business Profile"
        range={`${locations.length} ${locations.length === 1 ? "ficha" : "fichas"}`}
        breadcrumb="Inseryal"
        right={<AddFichaButton />}
      />

      <div style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
        {dbError ? (
          <Card>
            <div style={{ fontSize: 13, color: "var(--warn)", fontWeight: 500 }}>
              Error al cargar las fichas
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
        ) : locations.length === 0 ? (
          <Card padding={32}>
            <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
              Sin fichas todavía
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                marginTop: 4,
                letterSpacing: "-0.02em",
              }}
            >
              Empieza añadiendo tu primera ficha
            </div>
            <p
              style={{
                margin: "10px 0 16px",
                color: "var(--ink-3)",
                fontSize: 13.5,
                lineHeight: 1.55,
                maxWidth: 560,
              }}
            >
              Cada apartamento / proyecto se representa por una ficha de Google
              Business. Empieza por el nombre, el Place ID lo puedes añadir
              después.
            </p>
            <AddFichaButton />
          </Card>
        ) : (
          <Card padding={0}>
            <div
              style={{
                padding: "12px 22px",
                borderBottom: "1px solid var(--line)",
                display: "grid",
                gridTemplateColumns: "2fr 1.5fr 1fr 1fr 100px",
                gap: 14,
                fontSize: 11,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              <span>Ficha</span>
              <span>Google Place ID</span>
              <span>Estado OAuth</span>
              <span>Alta</span>
              <span></span>
            </div>
            {locations.map((loc, i) => (
              <FichaRow key={loc.id} loc={loc} last={i === locations.length - 1} />
            ))}
          </Card>
        )}
      </div>
    </>
  );
}

function FichaRow({ loc, last }: { loc: LocationRow; last: boolean }) {
  const oauthTone =
    loc.oauth_status === "connected"
      ? "ok"
      : loc.oauth_status === "error"
        ? "warn"
        : "neutral";
  const oauthLabel =
    loc.oauth_status === "connected"
      ? "Conectada"
      : loc.oauth_status === "error"
        ? "Error de conexión"
        : "Sin conectar";

  return (
    <div
      style={{
        padding: "14px 22px",
        borderBottom: last ? "none" : "1px solid var(--line)",
        display: "grid",
        gridTemplateColumns: "2fr 1.5fr 1fr 1fr 100px",
        gap: 14,
        alignItems: "center",
        fontSize: 13.5,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          letterSpacing: "-0.005em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {loc.name}
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: loc.google_place_id ? "var(--ink-3)" : "var(--ink-4)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {loc.google_place_id ?? "—"}
      </span>
      <span>
        <Pill tone={oauthTone} withDot>
          {oauthLabel}
        </Pill>
      </span>
      <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
        {new Date(loc.created_at).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </span>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <DeleteFichaButton id={loc.id} name={loc.name} />
      </div>
    </div>
  );
}
