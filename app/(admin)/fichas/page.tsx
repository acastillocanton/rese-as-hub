import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { OauthStatus } from "@/lib/supabase/types";
import { AddFichaButton } from "./AddFichaButton";
import { DeleteFichaButton } from "./DeleteFichaButton";
import { DisconnectGoogleButton } from "./DisconnectGoogleButton";
import { DismissibleBanner } from "./DismissibleBanner";
import { EditPlaceIdButton } from "./EditPlaceIdButton";
import { SyncNowButton } from "@/components/ui/SyncNowButton";

type LocationRow = {
  id: string;
  name: string;
  google_place_id: string | null;
  google_account_email: string | null;
  oauth_status: OauthStatus;
  oauth_last_sync_at: string | null;
  oauth_last_sync_error: string | null;
  created_at: string;
};

type SearchParams = Promise<{ connected?: string; oauth_error?: string }>;

const OAUTH_ERRORS: Record<string, string> = {
  missing_params: "Faltaba el código de autorización de Google.",
  state_mismatch: "La verificación de seguridad falló (state mismatch). Inténtalo otra vez.",
  bad_state: "Estado de la cookie inválido.",
  exchange_failed: "Google rechazó el intercambio de tokens. Revisa los datos en Google Cloud Console.",
  no_tokens: "Aún no hay credenciales para esta ficha. Inicia la conexión de nuevo.",
  access_denied: "Cancelaste el consent en Google.",
};

export default async function FichasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { connected, oauth_error: oauthError } = await searchParams;

  let locations: LocationRow[] = [];
  let dbError: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("locations")
      .select(
        "id, name, google_place_id, google_account_email, oauth_status, oauth_last_sync_at, oauth_last_sync_error, created_at",
      )
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
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <SyncNowButton label="Sincronizar todas" variant="ghost" />
            <AddFichaButton />
          </div>
        }
      />

      <div
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {connected && (
          <DismissibleBanner tone="ok">
            Ficha conectada con Google Business Profile.
          </DismissibleBanner>
        )}
        {oauthError && (
          <DismissibleBanner tone="warn">
            {OAUTH_ERRORS[oauthError] ?? `Error de OAuth: ${oauthError}`}
          </DismissibleBanner>
        )}

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
              Business. Empieza por el nombre; el Place ID se rellena
              automáticamente al conectar OAuth.
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
                gridTemplateColumns: "1.7fr 1.2fr 1fr 0.8fr 480px",
                gap: 14,
                fontSize: 11,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              <span>Ficha</span>
              <span>Cuenta Google</span>
              <span>Sincronización</span>
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
  // Estado consolidado de sincronización: la ficha trae reseñas si tiene
  // Business Profile conectado (preferido, paginable) o Places API vía
  // google_place_id. Si tiene OAuth en error pero NO tiene place_id, queda
  // sin sincronizar.
  const hasPlaceId = loc.google_place_id !== null;
  const isBpConnected = loc.oauth_status === "connected";
  const isBpError = loc.oauth_status === "error";

  const syncTone: "ok" | "warn" | "neutral" =
    isBpConnected || hasPlaceId ? "ok" : isBpError ? "warn" : "neutral";
  const syncLabel = isBpConnected
    ? "Business Profile"
    : hasPlaceId
      ? "Places API"
      : isBpError
        ? "Error OAuth"
        : "Sin Place ID";

  return (
    <div
      style={{
        padding: "14px 22px",
        borderBottom: last ? "none" : "1px solid var(--line)",
        display: "grid",
        gridTemplateColumns: "1.7fr 1.2fr 1fr 0.8fr 480px",
        gap: 14,
        alignItems: "center",
        fontSize: 13.5,
      }}
    >
      <div style={{ minWidth: 0 }}>
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
        {loc.google_place_id && (
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-4)",
              fontFamily: "var(--font-mono)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
            }}
          >
            {loc.google_place_id}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 12.5,
          color: loc.google_account_email ? "var(--ink-2)" : "var(--ink-4)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {loc.google_account_email ?? "—"}
      </span>
      <span>
        <Pill tone={syncTone} withDot>
          {syncLabel}
        </Pill>
      </span>
      <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
        {new Date(loc.created_at).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </span>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          alignItems: "center",
        }}
      >
        {loc.google_place_id && (
          <SyncNowButton
            locationId={loc.id}
            label="Sincronizar"
            size="sm"
            variant="ghost"
          />
        )}
        <EditPlaceIdButton id={loc.id} currentPlaceId={loc.google_place_id} />
        {loc.oauth_status === "connected" ? (
          <DisconnectGoogleButton id={loc.id} name={loc.name} />
        ) : (
          <a
            href={`/api/google/oauth/start?location_id=${loc.id}`}
            style={{
              padding: "6px 11px",
              border: "1px solid var(--line-strong)",
              borderRadius: 8,
              fontSize: 12.5,
              color: "var(--ink)",
              textDecoration: "none",
              fontWeight: 500,
              background: "var(--surface)",
            }}
          >
            {loc.oauth_status === "error" ? "Reconectar" : "Conectar Google"}
          </a>
        )}
        <DeleteFichaButton id={loc.id} name={loc.name} />
      </div>
    </div>
  );
}

