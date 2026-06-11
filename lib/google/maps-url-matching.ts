/**
 * Matcher puro: casa las reseñas del feed de Maps (cada una con su deep-link
 * de "Compartir reseña") con nuestras filas de BD, para poblar
 * `reviews.google_maps_url` (§4.54).
 *
 * Por qué hace falta casar por atributos: los identificadores de Google
 * (el `reviewId` de Business Profile, "AbFvOqm…") NO se relacionan con el
 * token del enlace de compartir ("Ci9DQUlR…") — son espacios distintos. La
 * única forma de unir "esta reseña de BD" con "este enlace del feed" es por
 * sus atributos visibles: autor + valoración + fecha.
 *
 * Filosofía CONSERVADORA (igual que edit-merge / reconcile-removed): preferir
 * un falso negativo (reseña sin deep-link → la UI cae a la lista, sin
 * regresión) a un falso positivo (deep-link de OTRA reseña → mandaría al
 * usuario a una reseña equivocada). Por eso solo se casa cuando el match es
 * ÚNICO en ambos sentidos.
 *
 * Módulo SIN I/O — la query de filas y el feed los trae el orquestador; aquí
 * solo se decide. `nameSimilarity` se reutiliza del matcher de atribución.
 */

import { nameSimilarity } from "@/lib/matching/attribute-review";

/** Fila de BD pendiente de deep-link. */
export type StoredReviewForMatch = {
  id: string;
  authorName: string;
  rating: number;
  /** ISO de `google_created_at`. */
  createdAtIso: string;
};

/** Reseña tal cual viene del feed/DOM de Maps, ya con su enlace público. */
export type UgcReviewForMatch = {
  /** Deep-link a la reseña concreta (/maps/reviews/data=… o maps.app.goo.gl/…). */
  url: string;
  authorName: string;
  rating: number;
  /** Epoch ms APROXIMADO de publicación. El DOM de Maps solo da fecha relativa
   *  ("hace 8 meses"), así que esto es una estimación gruesa o `null` si no se
   *  pudo parsear. Por eso la guarda temporal es laxa (ver DATE_WINDOW_MS) y se
   *  omite cuando es null — la identidad la fija autor+rating+unicidad. */
  createdAtMs?: number | null;
};

export type UrlMatch =
  | { reviewId: string; url: string; confidence: "exact" | "strong" }
  | { reviewId: string; skipped: SkipReason };

export type SkipReason =
  | "anonymous"
  | "no_candidate"
  | "ambiguous_multiple_ugc"
  | "ambiguous_shared_ugc";

/** Umbral de identidad por nombre: 90 = exacto o todos los tokens del uno en
 *  el otro (ver nameSimilarity). Por debajo no afirmamos que sea la misma
 *  persona. */
const NAME_IDENTITY_THRESHOLD = 90;

/** Guarda temporal LAXA: el DOM de Maps solo da fecha relativa ("hace 8
 *  meses"), imprecisa. 31 días absorbe esa imprecisión y solo sirve para
 *  rechazar mismatches groseros (reseña de esta semana vs "hace 3 años"). La
 *  identidad fina la dan autor + rating + unicidad, no la fecha. Se omite si la
 *  fecha del DOM no se pudo parsear (createdAtMs null). */
const DATE_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
/** Si las fechas casan al minuto-hora, el match es "exact"; si no, "strong". */
const EXACT_WINDOW_MS = 60 * 60 * 1000;

function isAnonymous(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "" || n === "anónimo" || n === "anonimo" || n === "a google user" || n === "usuario de google";
}

function passesBar(stored: StoredReviewForMatch, ugc: UgcReviewForMatch): boolean {
  if (stored.rating !== ugc.rating) return false;
  // Guarda temporal solo si el DOM dio una fecha utilizable.
  if (ugc.createdAtMs != null) {
    const storedMs = new Date(stored.createdAtIso).getTime();
    if (!Number.isFinite(storedMs)) return false;
    if (Math.abs(storedMs - ugc.createdAtMs) > DATE_WINDOW_MS) return false;
  }
  return nameSimilarity(stored.authorName, ugc.authorName) >= NAME_IDENTITY_THRESHOLD;
}

/**
 * Devuelve una decisión por cada fila almacenada. Solo asigna `url` cuando el
 * match es único en ambos sentidos:
 *   - la fila tiene EXACTAMENTE un candidato del feed que pasa el listón, y
 *   - ese candidato del feed no pasa el listón con NINGUNA otra fila.
 * Cualquier ambigüedad → skip (sin URL).
 *
 * `confidence`: "exact" si autor+fecha clavan (Δ ≤ 1h) — señal fuerte;
 * "strong" en el resto de matches únicos válidos.
 */
export function matchUgcToReviews(
  stored: StoredReviewForMatch[],
  ugc: UgcReviewForMatch[],
): UrlMatch[] {
  // Para detectar "ugc compartido", contamos a cuántas filas casa cada ugc.
  const ugcMatchCount = new Map<number, number>(); // índice ugc → nº filas
  for (let ui = 0; ui < ugc.length; ui++) {
    const u = ugc[ui]!;
    let n = 0;
    for (const s of stored) {
      if (!isAnonymous(s.authorName) && passesBar(s, u)) n++;
    }
    ugcMatchCount.set(ui, n);
  }

  const out: UrlMatch[] = [];
  for (const s of stored) {
    if (isAnonymous(s.authorName)) {
      out.push({ reviewId: s.id, skipped: "anonymous" });
      continue;
    }
    const candidates: number[] = [];
    for (let ui = 0; ui < ugc.length; ui++) {
      if (passesBar(s, ugc[ui]!)) candidates.push(ui);
    }
    if (candidates.length === 0) {
      out.push({ reviewId: s.id, skipped: "no_candidate" });
      continue;
    }
    if (candidates.length > 1) {
      out.push({ reviewId: s.id, skipped: "ambiguous_multiple_ugc" });
      continue;
    }
    const ui = candidates[0]!;
    // El único candidato, ¿casa también con otra fila? → compartido, ambiguo.
    if ((ugcMatchCount.get(ui) ?? 0) > 1) {
      out.push({ reviewId: s.id, skipped: "ambiguous_shared_ugc" });
      continue;
    }
    const u = ugc[ui]!;
    const storedMs = new Date(s.createdAtIso).getTime();
    const exact =
      u.createdAtMs != null &&
      Number.isFinite(storedMs) &&
      Math.abs(storedMs - u.createdAtMs) <= EXACT_WINDOW_MS;
    out.push({ reviewId: s.id, url: u.url, confidence: exact ? "exact" : "strong" });
  }
  return out;
}
