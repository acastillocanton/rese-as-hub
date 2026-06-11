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

/** Reseña tal cual viene del feed de Maps, ya con su enlace público. */
export type UgcReviewForMatch = {
  /** Deep-link a la reseña concreta (/maps/reviews/data=… o maps.app.goo.gl/…). */
  url: string;
  authorName: string;
  rating: number;
  /** Epoch ms de publicación de la reseña en Google. */
  createdAtMs: number;
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

/** Ventana temporal: el `createTime` de BP y el del feed pueden diferir algo
 *  (redondeos, ediciones). 48h es coherente con el resto del proyecto y, junto
 *  con autor idéntico + rating, basta para identidad. */
const DATE_WINDOW_MS = 48 * 60 * 60 * 1000;

function isAnonymous(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "" || n === "anónimo" || n === "anonimo" || n === "a google user" || n === "usuario de google";
}

function passesBar(stored: StoredReviewForMatch, ugc: UgcReviewForMatch): boolean {
  if (stored.rating !== ugc.rating) return false;
  const storedMs = new Date(stored.createdAtIso).getTime();
  if (!Number.isFinite(storedMs)) return false;
  if (Math.abs(storedMs - ugc.createdAtMs) > DATE_WINDOW_MS) return false;
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
    const exact = Math.abs(storedMs - u.createdAtMs) <= 60 * 60 * 1000;
    out.push({ reviewId: s.id, url: u.url, confidence: exact ? "exact" : "strong" });
  }
  return out;
}
