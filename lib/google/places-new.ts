import "server-only";

/**
 * Cliente para **Google Places API (New)** v1 — endpoint Place Details.
 *
 * A diferencia del cliente legacy ([lib/google/places.ts](lib/google/places.ts),
 * que usamos para sincronizar reseñas), este se usa SOLO para el
 * enriquecimiento de deep-links (§4.54): la API New devuelve, por cada reseña
 * destacada, un campo `googleMapsUri` que ES el enlace directo a esa reseña
 * concreta en Google Maps. Ninguna otra API oficial de Google lo expone.
 *
 * Limitación de origen: la API New devuelve solo ~5 reseñas "destacadas" por
 * ficha (las que Google elige; no pagina). Por eso esto cubre las reseñas más
 * visibles, no el histórico completo. El resto se rellena por otras vías
 * (pegado manual, o derivación offline si el spike de §4.54 lo permite).
 *
 * Mismo proyecto Cloud y misma API key que el legacy (`GOOGLE_PLACES_API_KEY`,
 * §4.18) — requiere "Places API (New)" habilitada (ya lo está).
 *
 * Endpoint: GET https://places.googleapis.com/v1/places/{placeId}
 *   header X-Goog-Api-Key + X-Goog-FieldMask con los campos de reviews.
 */

import { isValidPlaceId } from "./places";

/** Reseña destacada normalizada para el matcher de deep-links. */
export type PlaceNewReview = {
  /** Deep-link oficial a la reseña concreta en Google Maps. */
  mapsUri: string;
  author: string;
  hasAuthorName: boolean;
  rating: number;
  text: string | null;
  /** Epoch ms de publicación (absoluto y preciso, de `publishTime` ISO). */
  publishTimeMs: number | null;
  /** Resource name de la reseña en la API New: `places/{id}/reviews/{X}`. */
  name: string | null;
};

/** Shape parcial de la respuesta de Place Details (New). */
type PlaceNewReviewRaw = {
  name?: string;
  rating?: number;
  text?: { text?: string; languageCode?: string };
  originalText?: { text?: string; languageCode?: string };
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  publishTime?: string;
  googleMapsUri?: string;
};

type PlaceNewResponse = {
  reviews?: PlaceNewReviewRaw[];
  error?: { code?: number; message?: string; status?: string };
};

export class PlacesNewApiError extends Error {
  status: number;
  code: string | undefined;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "PlacesNewApiError";
    this.status = status;
    this.code = code;
  }
}

/** Retry con backoff exponencial para 429 y 5xx (espejo de places.ts). */
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
    const delay =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : baseDelayMs * 2 ** (attempt - 1);
    await new Promise((r) => setTimeout(r, delay));
  }
  return lastRes as Response;
}

/** Heurística de anonimato (espejo del legacy). */
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
 * Mapea una reseña cruda de la API New al shape interno. Devuelve null si no
 * trae `googleMapsUri` (sin enlace no sirve para el enriquecimiento) o si el
 * rating está fuera de rango. Exportada para tests.
 */
export function mapPlaceNewReview(r: PlaceNewReviewRaw): PlaceNewReview | null {
  const mapsUri = r.googleMapsUri?.trim();
  if (!mapsUri) return null;
  const rating = typeof r.rating === "number" ? Math.round(r.rating) : 0;
  if (rating < 1 || rating > 5) return null;
  const author = r.authorAttribution?.displayName?.trim() ?? "";
  const anonymous = looksAnonymousDisplayName(author);
  const text = r.text?.text?.trim() || r.originalText?.text?.trim() || null;
  let publishTimeMs: number | null = null;
  if (r.publishTime) {
    const ms = new Date(r.publishTime).getTime();
    if (Number.isFinite(ms)) publishTimeMs = ms;
  }
  return {
    mapsUri,
    author: anonymous ? "Anónimo" : author,
    hasAuthorName: !anonymous,
    rating,
    text: text && text !== "" ? text : null,
    publishTimeMs,
    name: r.name?.trim() || null,
  };
}

/**
 * Lee las reseñas destacadas (~5) de un Place ID vía Place Details (New),
 * cada una con su `googleMapsUri`. Lanza `PlacesNewApiError` si Google rechaza.
 */
export async function listPlaceNewReviews(placeId: string): Promise<PlaceNewReview[]> {
  if (!isValidPlaceId(placeId)) {
    throw new PlacesNewApiError(
      `Place ID inválido: ${placeId.slice(0, 30)}…`,
      400,
      "INVALID_PLACE_ID",
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new PlacesNewApiError(
      "Falta GOOGLE_PLACES_API_KEY en el entorno.",
      500,
      "MISSING_API_KEY",
    );
  }

  const fieldMask = [
    "reviews.name",
    "reviews.rating",
    "reviews.text",
    "reviews.originalText",
    "reviews.authorAttribution",
    "reviews.publishTime",
    "reviews.googleMapsUri",
  ].join(",");

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=es`;
  const res = await fetchWithRetry(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
  });

  const body = (await res.json().catch(() => ({}))) as PlaceNewResponse;

  if (!res.ok) {
    const msg = body.error?.message ?? `Places API (New) HTTP ${res.status}`;
    throw new PlacesNewApiError(msg, res.status, body.error?.status ?? `HTTP_${res.status}`);
  }

  const reviews = body.reviews ?? [];
  const mapped: PlaceNewReview[] = [];
  for (const r of reviews) {
    const m = mapPlaceNewReview(r);
    if (m) mapped.push(m);
  }
  return mapped;
}
