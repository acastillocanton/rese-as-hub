import "server-only";
import { createHash } from "node:crypto";

/**
 * Cliente para Google Places API (legacy) — endpoint Place Details.
 *
 * Vía de respaldo mientras esperamos la cuota de Business Profile API. A
 * diferencia de la "Places API (New)" v1, este endpoint legacy soporta
 * `reviews_sort=newest`, lo que nos da las **5 reseñas más recientes** en
 * lugar de las 5 "más relevantes". Crítico para fichas con histórico largo
 * donde las relevantes son antiguas y nos perdíamos las nuevas.
 *
 * Mismo proyecto Cloud, misma API key, misma cuota de Google Maps Platform.
 * Necesita "Places API" (sin "New") habilitada en el proyecto — la "New" no
 * cubre este endpoint.
 *
 * Endpoint: GET https://maps.googleapis.com/maps/api/place/details/json
 *   ?place_id={id}&fields=reviews&reviews_sort=newest&language=es&key={KEY}
 *
 * Limitaciones:
 *   - Sigue siendo top-5 por llamada, sin paginación. Si una ficha recibe
 *     >5 reseñas entre dos llamadas consecutivas, perdemos las del medio.
 *   - Mitigado con cron horario externo (GitHub Action) + botón
 *     "Sincronizar ahora" + importador manual.
 *   - El endpoint legacy NO devuelve `review_id` estable, así que
 *     sintetizamos uno a partir de `place_id + time + md5(author)` (igual
 *     que hace el plugin Reviby en producción).
 */

/** Place IDs de Google son base64url-like, 10-250 caracteres. */
export const PLACE_ID_PATTERN = /^[A-Za-z0-9_\-]{10,250}$/;

export function isValidPlaceId(placeId: string): boolean {
  return PLACE_ID_PATTERN.test(placeId);
}

/** Reseña normalizada — shape compatible con el insert del cron. */
export type PlacesReview = {
  /** Ya prefijado "places:" para no colisionar con IDs raw de Business
   *  Profile cuando llegue la cuota. Sintético: `${place_id}_${unix}_${md5_8}`. */
  google_review_id: string;
  author_name: string;
  hasAuthorName: boolean;
  rating: number;
  text: string | null;
  google_created_at: string;
};

/** Shape parcial de la respuesta del Place Details legacy. */
type PlaceDetailsReview = {
  author_name?: string;
  author_url?: string;
  profile_photo_url?: string;
  rating?: number;
  relative_time_description?: string;
  text?: string;
  language?: string;
  /** Unix timestamp en SEGUNDOS (no milisegundos). */
  time?: number;
};

type PlaceDetailsResponse = {
  /** "OK" | "ZERO_RESULTS" | "NOT_FOUND" | "INVALID_REQUEST" |
   *  "OVER_QUERY_LIMIT" | "REQUEST_DENIED" | "UNKNOWN_ERROR" */
  status?: string;
  error_message?: string;
  result?: {
    name?: string;
    reviews?: PlaceDetailsReview[];
  };
};

/**
 * Retry con backoff exponencial para 429 y 5xx.
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
 * Heurística de anonimato. Places devuelve a veces "Un usuario de Google"
 * cuando el reviewer no expone su nombre.
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
 * Genera un pseudo-ID estable a partir de `(place_id, time, author)`. Mismo
 * patrón que usa el plugin Reviby. Estable mientras Google no modifique el
 * texto/autor de la reseña — si lo hace, entraría como duplicado, pero es
 * extremadamente raro.
 */
export function synthesizeReviewId(
  placeId: string,
  time: number,
  author: string,
): string {
  const hash = createHash("md5").update(author).digest("hex").slice(0, 8);
  return `${placeId}_${time}_${hash}`;
}

/**
 * Mapea una reseña del Place Details legacy al shape interno. Exportado
 * para tests.
 */
export function mapPlacesReview(
  placeId: string,
  r: PlaceDetailsReview,
): PlacesReview | null {
  if (typeof r.time !== "number" || r.time <= 0) return null;
  const author = r.author_name?.trim() ?? "";
  const anonymous = looksAnonymousDisplayName(author);
  const rating = typeof r.rating === "number" ? Math.round(r.rating) : 0;
  if (rating < 1 || rating > 5) return null;
  const text = r.text?.trim() || null;
  // Unix timestamp en segundos → ISO en milisegundos
  const iso = new Date(r.time * 1000).toISOString();
  const synthetic = synthesizeReviewId(
    placeId,
    r.time,
    anonymous ? "anonymous" : author,
  );
  return {
    google_review_id: `places:${synthetic}`,
    author_name: anonymous ? "Anónimo" : author,
    hasAuthorName: !anonymous,
    rating,
    text: text && text !== "" ? text : null,
    google_created_at: iso,
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
 * Lee las 5 reseñas más recientes de un Place ID via Place Details legacy.
 * Lanza `PlacesApiError` si Google rechaza (cuota, API key inválida, etc.).
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

  const params = new URLSearchParams({
    place_id: placeId,
    fields: "reviews",
    reviews_sort: "newest",
    language: "es",
    key: apiKey,
  });
  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
  const res = await fetchWithRetry(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new PlacesApiError(
      `Places API HTTP ${res.status}`,
      res.status,
      `HTTP_${res.status}`,
    );
  }

  const body = (await res.json()) as PlaceDetailsResponse;
  const status = body.status ?? "UNKNOWN";

  if (status === "ZERO_RESULTS" || status === "NOT_FOUND") {
    return [];
  }
  if (status !== "OK") {
    throw new PlacesApiError(
      body.error_message ?? `Places API status ${status}`,
      400,
      status,
    );
  }

  const reviews = body.result?.reviews ?? [];
  const mapped: PlacesReview[] = [];
  for (const r of reviews) {
    const m = mapPlacesReview(placeId, r);
    if (m) mapped.push(m);
  }
  return mapped;
}
