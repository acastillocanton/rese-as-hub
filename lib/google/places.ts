import "server-only";

/**
 * Cliente para Google Places API (New) v1.
 *
 * Vía de respaldo mientras esperamos la aprobación de cuota para Business
 * Profile API. A diferencia de Business Profile, Places API:
 *   - Solo necesita una API key (sin OAuth, sin verificación, sin aprobación).
 *   - Devuelve hasta 5 reseñas más recientes por place (sin paginación).
 *   - Cubre cualquier negocio público de Google Maps con su Place ID.
 *
 * Limitación principal: si una ficha recibe >5 reseñas en 24h, las más
 * antiguas se pierden hasta que llegue Business Profile API. La columna
 * `source='places_api'` (migración 009) marca de dónde vino cada reseña;
 * cuando llegue la cuota oficial, un script de dedup quita los clones.
 *
 * Endpoint: GET https://places.googleapis.com/v1/places/{place_id}
 *   ?fields=reviews,id
 *   header: X-Goog-Api-Key: <GOOGLE_PLACES_API_KEY>
 *
 * Coste: 1000 requests/día gratis. Con 7 fichas × 1 cron/día → 7 req/día
 * → cero coste real para Inseryal.
 */

/** Place IDs de Google son base64url-like, 10-250 caracteres. Validamos el
 *  formato antes de incluirlo en la URL para evitar requests inválidas y
 *  posibles inyecciones en el path. */
export const PLACE_ID_PATTERN = /^[A-Za-z0-9_\-]{10,250}$/;

export function isValidPlaceId(placeId: string): boolean {
  return PLACE_ID_PATTERN.test(placeId);
}

/** Reseña normalizada — shape compatible con el insert que ya hace el cron
 *  de Business Profile (location_id, google_review_id, author_name, rating,
 *  text, google_created_at, fetched_at + campos del matcher). */
export type PlacesReview = {
  /** Ya prefijado "places:" para que no colisione con los IDs raw de
   *  Business Profile cuando llegue la cuota. */
  google_review_id: string;
  author_name: string;
  /** false cuando el reviewer es anónimo (Places no devuelve displayName
   *  o devuelve placeholder). Activa el modo temporal-only del matcher. */
  hasAuthorName: boolean;
  /** 1-5. Places devuelve número directamente (no enum como Business
   *  Profile). */
  rating: number;
  text: string | null;
  /** ISO timestamp del publishTime. */
  google_created_at: string;
};

/** Shape parcial de la respuesta de Places API (solo los campos que
 *  necesitamos). Otros campos como `originalText`, `googleMapsUri`, etc.
 *  los ignoramos. */
type PlacesApiReview = {
  /** Formato: "places/{place_id}/reviews/{review_id}" */
  name?: string;
  rating?: number;
  text?: { text?: string; languageCode?: string };
  originalText?: { text?: string; languageCode?: string };
  authorAttribution?: {
    displayName?: string;
    uri?: string;
    photoUri?: string;
  };
  publishTime?: string;
};

type PlacesApiResponse = {
  id?: string;
  reviews?: PlacesApiReview[];
  error?: { code?: number; message?: string; status?: string };
};

/**
 * Retry con backoff exponencial para 429 y 5xx. Mismo patrón que el cliente
 * de Business Profile pero sin envoltorio OAuth (Places usa API key fija).
 */
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
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : baseDelayMs * 2 ** (attempt - 1);
    await new Promise((r) => setTimeout(r, delay));
  }
  return lastRes as Response;
}

/**
 * Extrae el último segmento de `places/{place_id}/reviews/{review_id}`.
 * Si el formato no coincide, devuelve el `name` tal cual (fallback
 * defensivo — la unique constraint sigue protegiendo de duplicados pero
 * el ID será menos legible).
 */
export function extractReviewId(name: string): string {
  const idx = name.lastIndexOf("/");
  if (idx === -1 || idx === name.length - 1) return name;
  return name.slice(idx + 1);
}

/**
 * Heurística de anonimato. Places devuelve displayName aunque sea placeholder
 * tipo "Un usuario de Google" o cadena vacía. Tratamos esos casos como
 * anónimos para que el matcher use ventana corta + único candidato.
 */
function looksAnonymousDisplayName(name: string | undefined | null): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  if (n === "") return true;
  return (
    n === "anónimo" ||
    n === "anonimo" ||
    n === "un usuario de google" ||
    n === "a google user" ||
    n === "usuario de google" ||
    n === "google user"
  );
}

/**
 * Convierte el shape de Places API a nuestro `PlacesReview`. Exportado para
 * tests; el cron usa directamente `listPlaceReviews`.
 */
export function mapPlacesReview(r: PlacesApiReview): PlacesReview | null {
  if (!r.name || !r.publishTime) return null;
  const rid = extractReviewId(r.name);
  const author = r.authorAttribution?.displayName?.trim() ?? "";
  const anonymous = looksAnonymousDisplayName(author);
  const rating = typeof r.rating === "number" ? Math.round(r.rating) : 0;
  if (rating < 1 || rating > 5) return null;
  const text = r.text?.text?.trim() || r.originalText?.text?.trim() || null;
  return {
    google_review_id: `places:${rid}`,
    author_name: anonymous ? "Anónimo" : author,
    hasAuthorName: !anonymous,
    rating,
    text: text && text !== "" ? text : null,
    google_created_at: r.publishTime,
  };
}

export class PlacesApiError extends Error {
  status: number;
  code: string | undefined;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "PlacesApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Lee las reseñas top-5 de un Place ID. Lanza `PlacesApiError` si Google
 * rechaza la petición (cuota agotada, API key inválida, Place ID malformado,
 * etc.) — el caller (cron) decide qué hacer con el error.
 */
export async function listPlaceReviews(placeId: string): Promise<PlacesReview[]> {
  if (!isValidPlaceId(placeId)) {
    throw new PlacesApiError(
      `Place ID inválido: ${placeId.slice(0, 30)}…`,
      400,
      "INVALID_PLACE_ID",
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new PlacesApiError(
      "Falta GOOGLE_PLACES_API_KEY en el entorno.",
      500,
      "MISSING_API_KEY",
    );
  }

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=reviews,id`;
  const res = await fetchWithRetry(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "Accept-Language": "es",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    let body: PlacesApiResponse = {};
    try {
      body = (await res.json()) as PlacesApiResponse;
    } catch {
      // body no era JSON
    }
    throw new PlacesApiError(
      body.error?.message ?? `Places API HTTP ${res.status}`,
      res.status,
      body.error?.status,
    );
  }

  const body = (await res.json()) as PlacesApiResponse;
  const reviews = body.reviews ?? [];
  const mapped: PlacesReview[] = [];
  for (const r of reviews) {
    const m = mapPlacesReview(r);
    if (m) mapped.push(m);
  }
  return mapped;
}
