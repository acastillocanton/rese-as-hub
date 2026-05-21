import "server-only";

/**
 * Algoritmo de atribución de reseñas a comerciales.
 *
 * Combinación de dos señales:
 *   1. Ventana temporal — toda reseña debe llegar después de que el cliente
 *      haya abierto su enlace personal, y dentro de una ventana razonable.
 *   2. Nombre del autor de la reseña vs nombre del cliente que abrió el
 *      enlace (Google a veces muestra solo nombre + inicial; lo manejamos).
 *
 * Resultado: { sales_id, client_id, share_link_id, match_state, confidence }
 *   - match_state='counted' si confianza >= AUTO_THRESHOLD → cuenta para el
 *     comercial automáticamente.
 *   - 'pending' si está entre PENDING_THRESHOLD y AUTO_THRESHOLD → va a la
 *     bandeja de verificación del admin.
 *   - 'unmatched' si no se encontró candidato razonable.
 *
 * Tuning: los thresholds son conservadores. Si entran muchos falsos
 * negativos, bajar AUTO. Si entran falsos positivos, subir AUTO.
 */

// ─── Parámetros ─────────────────────────────────────────────────────────────

/** Reseñas que llegan más allá de esta ventana no se intentan matchear. */
export const TEMPORAL_WINDOW_HOURS = 48;

/** Bonus si la reseña llega muy pronto tras la apertura del enlace. */
const TEMPORAL_BONUS_HOURS = 4;

/** Confianza >= este valor → match automático (counted). */
export const AUTO_THRESHOLD = 75;

/** Confianza entre PENDING_THRESHOLD y AUTO_THRESHOLD → 'pending'. */
export const PENDING_THRESHOLD = 40;

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type ShareLinkCandidate = {
  id: string;
  sales_id: string;
  client_id: string | null;
  client_full_name: string | null;
  opened_at: string; // ISO
};

export type ReviewInput = {
  google_review_id: string;
  author_name: string;
  google_created_at: string; // ISO
};

export type MatchResult = {
  match_state: "counted" | "pending" | "unmatched";
  match_confidence: number; // 0..100
  match_evidence: Record<string, unknown>;
  sales_id?: string;
  client_id?: string;
  share_link_id?: string;
};

// ─── Utilidades de normalización ────────────────────────────────────────────

/** Quita acentos, baja a minúsculas, colapsa espacios. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Separa en tokens (palabras), eliminando vacíos. */
function tokenize(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length > 0);
}

/**
 * Score de similitud entre nombre de cliente y nombre que aparece en la
 * reseña. 0..100.
 *
 * Heurística:
 * - Coincidencia exacta de todos los tokens del cliente → 100.
 * - Todos los tokens del cliente aparecen en el autor → 90.
 * - El primer nombre del cliente coincide + alguna otra señal → 70.
 * - Solo coincide primer nombre → 50.
 * - Inicial + primer nombre estilo "Antonio R." → 65-75.
 * - Sin coincidencia → 0.
 */
export function nameSimilarity(clientName: string, authorName: string): number {
  const clientTokens = tokenize(clientName);
  const authorTokens = tokenize(authorName);
  if (clientTokens.length === 0 || authorTokens.length === 0) return 0;

  const clientFirst = clientTokens[0];
  const authorFirst = authorTokens[0];

  // Exacto: misma cadena normalizada.
  if (normalize(clientName) === normalize(authorName)) return 100;

  const clientSet = new Set(clientTokens);
  const authorSet = new Set(authorTokens);
  const intersection = [...clientSet].filter((t) => authorSet.has(t));

  // Todos los tokens del cliente aparecen en el autor.
  if (intersection.length === clientTokens.length) return 90;

  // Primer nombre coincide + algún apellido más, o el autor incluye una
  // inicial del primer apellido del cliente ("Antonio R.").
  if (clientFirst === authorFirst) {
    const clientLast = clientTokens[1];
    if (clientLast && authorTokens.length >= 2) {
      const authorSecond = authorTokens[1];
      if (authorSecond === clientLast) return 88;
      // Inicial: "r" coincide con "ramirez"
      if (authorSecond.length === 1 && clientLast.startsWith(authorSecond)) {
        return 72;
      }
      if (clientLast.length === 1 && authorSecond.startsWith(clientLast)) {
        return 72;
      }
    }
    return 55;
  }

  // Solo intersección parcial de apellidos sin primer nombre — muy débil.
  if (intersection.length > 0) return 30;

  return 0;
}

// ─── Núcleo del matcher ─────────────────────────────────────────────────────

/**
 * Dada una reseña y la lista de share_links de la misma ficha en la ventana
 * temporal previa, escoge el mejor candidato (si lo hay) y devuelve el
 * resultado del matching.
 *
 * No hace I/O: el caller (cron) le pasa los candidatos ya filtrados por
 * `location_id` y por `opened_at >= review.created - TEMPORAL_WINDOW_HOURS`.
 */
export function attributeReview(
  review: ReviewInput,
  candidates: ShareLinkCandidate[],
): MatchResult {
  const reviewMs = new Date(review.google_created_at).getTime();

  let best: {
    candidate: ShareLinkCandidate;
    score: number;
    nameScore: number;
    hoursDelta: number;
  } | null = null;

  for (const c of candidates) {
    const openedMs = new Date(c.opened_at).getTime();
    if (openedMs > reviewMs) continue; // share posterior a la reseña: imposible
    const hoursDelta = (reviewMs - openedMs) / 3_600_000;
    if (hoursDelta > TEMPORAL_WINDOW_HOURS) continue;

    const nameScore = c.client_full_name
      ? nameSimilarity(c.client_full_name, review.author_name)
      : 0;

    // Ajuste temporal: bonus si llegó muy pronto, penalización si va
    // hacia el final de la ventana.
    let temporalAdj = 0;
    if (hoursDelta <= TEMPORAL_BONUS_HOURS) temporalAdj = 8;
    else if (hoursDelta > 24) temporalAdj = -10;

    const score = Math.min(100, Math.max(0, nameScore + temporalAdj));

    if (!best || score > best.score) {
      best = { candidate: c, score, nameScore, hoursDelta };
    }
  }

  if (!best || best.score < PENDING_THRESHOLD) {
    return {
      match_state: "unmatched",
      match_confidence: best?.score ?? 0,
      match_evidence: {
        reason: best
          ? `best_score_below_pending_threshold (${best.score})`
          : "no_share_links_in_window",
        candidates_considered: candidates.length,
        window_hours: TEMPORAL_WINDOW_HOURS,
      },
    };
  }

  const state: MatchResult["match_state"] =
    best.score >= AUTO_THRESHOLD ? "counted" : "pending";

  return {
    match_state: state,
    match_confidence: Math.round(best.score),
    match_evidence: {
      share_link_id: best.candidate.id,
      client_full_name: best.candidate.client_full_name,
      review_author: review.author_name,
      name_score: best.nameScore,
      hours_delta: Number(best.hoursDelta.toFixed(2)),
      candidates_considered: candidates.length,
    },
    sales_id: best.candidate.sales_id,
    client_id: best.candidate.client_id ?? undefined,
    share_link_id: best.candidate.id,
  };
}
