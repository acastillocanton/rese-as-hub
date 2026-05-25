import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { OauthStatus, Brand } from "@/lib/supabase/types";
import { AddFichaButton } from "./AddFichaButton";
import { DeleteFichaButton } from "./DeleteFichaButton";
import { DisconnectGoogleButton } from "./DisconnectGoogleButton";
import { DismissibleBanner } from "./DismissibleBanner";
import { EditPlaceIdButton } from "./EditPlaceIdButton";
import { EditBrandButton } from "./EditBrandButton";
import { EditRatingButton } from "./EditRatingButton";
import { SyncNowButton } from "@/components/ui/SyncNowButton";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb, getBrandLabel } from "@/lib/branding";

type LocationRow = {
  id: string;
  name: string;
  brand: Brand;
  google_place_id: string | null;
  google_account_email: string | null;
  oauth_status: OauthStatus;
  oauth_last_sync_at: string | null;
  oauth_last_sync_error: string | null;
  average_rating: number | null;
  total_review_count: number | null;
  rating_updated_at: string | null;
  rating_source: "manual" | "google_api" | null;
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
  const brand = await getCurrentUserBrand();

  let locations: LocationRow[] = [];
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
    // Para office_director la RLS restringe a una sola fila (su location).
    // Para admin devuelve todas. No hace falta `.eq` explícito aquí.
    const { data, error } = await supabase
      .from("locations")
      .select(
        "id, name, brand, google_place_id, google_account_email, oauth_status, oauth_last_sync_at, oauth_last_sync_error, average_rating, total_review_count, rating_updated_at, rating_source, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) {
      dbError = error.message;
    } else {
      locations = (data ?? []) as LocationRow[];
    }
  }

  const isDirector = viewerRole === "office_director";
  const canCreateLocations = viewerRole === "admin";

  return (
    <>
      <Topbar
        title={isDirector ? "Mi ficha" : "Fichas Google"}
        subtitle={
          isDirector
            ? "Tu oficina en Google Business Profile"
            : "Fichas de Google Business Profile"
        }
        range={
          isDirector
            ? locations[0]?.name ?? "—"
            : `${locations.length} ${locations.length === 1 ? "ficha" : "fichas"}`
        }
        breadcrumb={getBrandBreadcrumb(brand)}
        compact={isDirector}
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <SyncNowButton
              label={isDirector ? "Sincronizar" : "Sincronizar todas"}
              variant="ghost"
              locationId={isDirector ? locations[0]?.id : undefined}
            />
            {canCreateLocations && <AddFichaButton />}
          </div>
        }
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
              {isDirector
                ? "Tu oficina aún no tiene ficha asignada"
                : "Empieza añadiendo tu primera ficha"}
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
              {isDirector
                ? "Habla con el administrador general para que te asigne una ficha (location)."
                : "Cada apartamento / proyecto se representa por una ficha de Google Business. Empieza por el nombre; el Place ID se rellena automáticamente al conectar OAuth."}
            </p>
            {canCreateLocations && <AddFichaButton />}
          </Card>
        ) : (
          // Scroll horizontal en mobile — la tabla tiene 6 columnas y
          // ~400px de botones; no caben en viewports <767px sin scroll.
          <div style={{ overflowX: "auto" }}>
            <Card padding={0}>
              <div
                style={{
                  padding: "12px 22px",
                  borderBottom: "1px solid var(--line)",
                  display: "grid",
                  gridTemplateColumns: "1.6fr 1.1fr 0.9fr 0.8fr 0.9fr 400px",
                  gap: 14,
                  fontSize: 11,
                  color: "var(--ink-4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  minWidth: 920,
                }}
              >
                <span>Ficha</span>
                <span>Cuenta Google</span>
                <span>Sincronización</span>
                <span>Alta</span>
                <span style={{ textAlign: "right" }}>Rating · Total</span>
                <span></span>
              </div>
              {locations.map((loc, i) => (
                <FichaRow
                  key={loc.id}
                  loc={loc}
                  last={i === locations.length - 1}
                  canDelete={canCreateLocations}
                />
              ))}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function FichaRow({
  loc,
  last,
  canDelete,
}: {
  loc: LocationRow;
  last: boolean;
  canDelete: boolean;
}) {
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
        gridTemplateColumns: "1.6fr 1.1fr 0.9fr 0.8fr 0.9fr 400px",
        gap: 14,
        alignItems: "center",
        fontSize: 13.5,
        minWidth: 920,
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
        <div
          style={{
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Pill tone="neutral">{getBrandLabel(loc.brand)}</Pill>
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
              marginTop: 4,
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
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <EditRatingButton
          id={loc.id}
          name={loc.name}
          averageRating={loc.average_rating}
          totalReviewCount={loc.total_review_count}
          ratingUpdatedAt={loc.rating_updated_at}
          ratingSource={loc.rating_source}
        />
      </div>
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
        {canDelete && <EditBrandButton id={loc.id} currentBrand={loc.brand} />}
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
        {canDelete && <DeleteFichaButton id={loc.id} name={loc.name} />}
      </div>
    </div>
  );
}

