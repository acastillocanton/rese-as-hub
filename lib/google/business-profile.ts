import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Retry con backoff exponencial para 429 y 5xx. Google Business Profile
 * acota agresivamente (cuota por minuto) y el cron corre cada 10 min: si nos
 * comemos un 429 sin reintentar, la ficha pierde la ventana. 3 intentos
 * cubren la mayoría de hiccups sin alargar el cron en exceso.
 *
 * El delay entre intentos se acota a MAX_RETRY_DELAY_MS aunque Google mande un
 * `Retry-After` mayor: todo esto corre dentro de lambdas con maxDuration=60s
 * (tope Hobby) y esperas de 30-60s por un solo 429 producían
 * FUNCTION_INVOCATION_TIMEOUT (504) en el cron horario. Un 429 persistente lo
 * recoge el siguiente run — no merece quemarse el presupuesto esperándolo.
 */
const MAX_RETRY_DELAY_MS = 8_000;

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { maxAttempts = 3, baseDelayMs = 500 }: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    const retriable = res.status === 429 || (res.status >= 500 && res.status < 600);
    if (!retriable || attempt === maxAttempts) return res;
    lastRes = res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay = Math.min(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : baseDelayMs * 2 ** (attempt - 1),
      MAX_RETRY_DELAY_MS,
    );
    await new Promise((r) => setTimeout(r, delay));
  }
  return lastRes as Response;
}

/**
 * Cliente para Google Business Profile API.
 *
 * Cubre tres surfaces de Google que necesitamos para sincronizar reseñas:
 * - OAuth 2.0 (accounts.google.com + oauth2.googleapis.com) para conectar la cuenta.
 * - Account Management API (mybusinessaccountmanagement.googleapis.com/v1)
 *   para listar las cuentas que el usuario gestiona.
 * - Business Information API (mybusinessbusinessinformation.googleapis.com/v1)
 *   para listar las fichas (locations) de cada cuenta.
 * - Reviews API (mybusiness.googleapis.com/v4) — la API legacy que sigue siendo
 *   donde viven las reseñas. Requiere aprobación explícita de Google. En
 *   modo "Testing" del consent screen funciona para usuarios de prueba.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
// Scopes pedidos al usuario:
//  - business.manage → leer fichas + reseñas (objetivo principal)
//  - openid + email   → permite llamar al endpoint /userinfo para mostrar al
//                       admin con qué cuenta de Google se ha autenticado.
const SCOPE = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/business.manage",
].join(" ");

function requireEnv(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI en .env.local",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Clasifica si un mensaje de error de sincronización corresponde a un fallo de
 * AUTENTICACIÓN/AUTORIZACIÓN del token (refresh token caducado/revocado, sin
 * token, credenciales inválidas o scope insuficiente) — frente a un fallo
 * TRANSITORIO (5xx, 429, red). Conservador a propósito: solo `true` ante firmas
 * inequívocas de auth, para que `markSyncError` (sync-business-profile.ts) marque
 * la ficha como `oauth_status='error'` (necesita reconexión manual) sin sacar del
 * ciclo del cron a una ficha sana por un blip. Ver CLAUDE.md §4.58.
 */
export function isOAuthAuthError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("invalid_grant") ||
    m.includes("no_refresh_token") ||
    m.includes("token refresh failed") ||
    m.includes("token exchange failed") ||
    m.includes("invalid_client") ||
    m.includes("access_token_scope_insufficient") ||
    m.includes("insufficient authentication scopes") ||
    m.includes("(401)") ||
    m.includes("unauthenticated")
  );
}

export function getOAuthStartUrl(state: string): string {
  const { clientId, redirectUri } = requireEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // hace falta para que Google devuelva refresh_token
    prompt: "consent", // fuerza el consent para garantizar el refresh_token
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: "Bearer";
  scope: string;
  id_token?: string;
};

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const { clientId, clientSecret, redirectUri } = requireEnv();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as GoogleTokens;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = requireEnv();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as GoogleTokens;
}

/**
 * Devuelve un access_token válido para la ficha. Si el actual ha caducado (o
 * caduca en menos de 60s), refresca y persiste el nuevo en location_secrets.
 * Retorna null si la ficha no tiene refresh_token (no conectada).
 */
export async function getValidAccessTokenForLocation(
  locationId: string,
): Promise<string | null> {
  const admin = createServiceClient();
  const { data: secret } = await admin
    .from("location_secrets")
    .select("oauth_refresh_token, oauth_access_token, expires_at")
    .eq("location_id", locationId)
    .maybeSingle<{
      oauth_refresh_token: string | null;
      oauth_access_token: string | null;
      expires_at: string | null;
    }>();

  if (!secret?.oauth_refresh_token) return null;

  if (secret.oauth_access_token && secret.expires_at) {
    const expiresAt = new Date(secret.expires_at).getTime();
    if (expiresAt - 60_000 > Date.now()) {
      return secret.oauth_access_token;
    }
  }

  const fresh = await refreshAccessToken(secret.oauth_refresh_token);
  const newExpiresAt = new Date(Date.now() + fresh.expires_in * 1000).toISOString();

  await admin
    .from("location_secrets")
    .update({
      oauth_access_token: fresh.access_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("location_id", locationId);

  return fresh.access_token;
}

/**
 * UserInfo — devuelve email + sub del usuario logueado con un access_token.
 * Usado tras el callback para guardar `google_account_email` en locations.
 */
export type UserInfo = { email: string; sub: string; name?: string };

export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed (${res.status})`);
  return (await res.json()) as UserInfo;
}

// ─── Account Management API ─────────────────────────────────────────────────

export type GoogleAccount = {
  name: string; // "accounts/123"
  accountName: string;
  type?: "PERSONAL" | "BUSINESS" | "ORGANIZATION" | "LOCATION_GROUP";
  role?: string;
};

export async function listAccounts(accessToken: string): Promise<GoogleAccount[]> {
  const res = await fetchWithRetry(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`listAccounts failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { accounts?: GoogleAccount[] };
  return data.accounts ?? [];
}

// ─── Business Information API ──────────────────────────────────────────────

export type GoogleLocation = {
  name: string; // "locations/456" — relativa al account en el path
  title: string;
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    regionCode?: string;
  };
  metadata?: {
    placeId?: string;
    mapsUri?: string;
  };
};

export async function listLocations(
  accessToken: string,
  accountResource: string, // "accounts/123"
): Promise<GoogleLocation[]> {
  const readMask = "name,title,storefrontAddress,metadata";
  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountResource}/locations?readMask=${readMask}&pageSize=100`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`listLocations failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { locations?: GoogleLocation[] };
  return data.locations ?? [];
}

export type GoogleLocationRating = {
  totalReviewCount: number;
  averageRating: number; // 0.0 a 5.0 con 1 decimal
};

/**
 * Devuelve el total de reseñas + valoración media global de una ficha en
 * Google. Usado por la cabecera del parte Excel ("1.567 RESEÑAS ACUMULADAS.
 * VALORACIÓN: 4,9 PUNTOS DE 5"). Hoy esta función NO se llama en runtime
 * porque la cuota de la API está a 0 — los valores se editan manualmente
 * desde /fichas. Cuando Google apruebe (caso 5-5855000041022), el cron de
 * sync la invocará por ficha conectada para sobrescribir el caché.
 *
 * `locationResource` debe ser el resource name completo,
 * e.g. "accounts/123/locations/456" o "locations/456".
 */
export async function getLocationRating(
  accessToken: string,
  locationResource: string,
): Promise<GoogleLocationRating | null> {
  const readMask = "metadata.totalReviewCount,metadata.averageRating";
  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${locationResource}?readMask=${readMask}`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`getLocationRating failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    metadata?: { totalReviewCount?: number; averageRating?: number };
  };
  const meta = data.metadata;
  if (!meta || typeof meta.totalReviewCount !== "number" || typeof meta.averageRating !== "number") {
    return null;
  }
  return {
    totalReviewCount: meta.totalReviewCount,
    averageRating: meta.averageRating,
  };
}

// ─── Reviews API (legacy v4) ────────────────────────────────────────────────

export type GoogleStarRating = "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";

export type GoogleReview = {
  reviewId: string;
  reviewer: {
    displayName?: string;
    profilePhotoUrl?: string;
    isAnonymous?: boolean;
  };
  starRating: GoogleStarRating;
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: { comment: string; updateTime: string };
};

/**
 * Lista reseñas de una ficha. `locationResource` debe ser el resource name
 * completo, e.g. "accounts/123/locations/456". Paginado: pasa pageToken para
 * páginas siguientes.
 *
 * ⚠️ Esta API requiere aprobación explícita de Google para uso en producción.
 * Durante "Testing" del consent screen funciona para los emails listados como
 * test users.
 */
export async function listReviews(
  accessToken: string,
  locationResource: string,
  options: { pageToken?: string; pageSize?: number } = {},
): Promise<{ reviews: GoogleReview[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    pageSize: String(options.pageSize ?? 50),
  });
  if (options.pageToken) params.set("pageToken", options.pageToken);

  const url = `https://mybusiness.googleapis.com/v4/${locationResource}/reviews?${params}`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`listReviews failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    reviews?: GoogleReview[];
    nextPageToken?: string;
  };
  return { reviews: data.reviews ?? [], nextPageToken: data.nextPageToken };
}

/**
 * Publica o actualiza la respuesta del propietario a una reseña.
 *   PUT v4/{locationResource}/reviews/{reviewId}/reply  body { comment }
 *
 * `locationResource` = resource name completo ("accounts/123/locations/456").
 * `reviewId` = el reviewId RAW de Business Profile (NO el sintético "places:..."
 * de Places API, que no sirve para este endpoint — ver CLAUDE.md §4.17).
 * Idempotente del lado de Google: un re-PUT sobrescribe la respuesta previa.
 *
 * ⚠️ HOY no se invoca en runtime (cuota Business Profile a 0 — caso
 * 5-5855000041022, §4.26). Queda listo para el Bloque G de la activación.
 */
export async function replyToReview(
  accessToken: string,
  locationResource: string,
  reviewId: string,
  comment: string,
): Promise<{ comment: string; updateTime: string }> {
  const url = `https://mybusiness.googleapis.com/v4/${locationResource}/reviews/${reviewId}/reply`;
  const res = await fetchWithRetry(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) {
    throw new Error(`replyToReview failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as { comment: string; updateTime: string };
}

const STAR_TO_INT: Record<GoogleStarRating, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export function starRatingToInt(r: GoogleStarRating): number {
  return STAR_TO_INT[r] ?? 0;
}
