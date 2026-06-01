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

/**
 * Rescate por mención del comercial (ver `rescueByCommercialMention`).
 *
 * En este negocio la relación es PERSONAL con el comercial, así que la reseña
 * casi siempre nombra al comercial ("Tono es muy buen comercial"), mientras
 * que el nombre del autor en Google rara vez coincide con el que el comercial
 * dio de alta como cliente ("Maf" vs "Marta Ferrer"). Cuando la atribución
 * normal por nombre+tiempo se quedaría en `unmatched`, intentamos rescatarla
 * usando la mención del comercial en el texto.
 *
 * Decisión de producto clave (anti-fraude): la mención NUNCA atribuye en
 * automático. Solo rescata a `pending` para que un humano (Bel) confirme. Por
 * eso ambas confianzas son < AUTO_THRESHOLD.
 */
/** Token mínimo del nombre del comercial que cuenta como mención (evita que
 *  partículas tipo "de"/"la" o iniciales sueltas disparen falsos positivos). */
const MIN_MENTION_TOKEN_LEN = 3;
/** Confianza del rescate cuando el comercial mencionado SÍ tiene un enlace
 *  abierto en la ventana temporal (hay cliente candidato). */
const MENTION_RESCUE_CONFIDENCE = 60;
/** Confianza del rescate cuando el comercial mencionado NO tiene enlace en
 *  ventana (más débil: pre-asignamos al comercial sin cliente). */
const MENTION_RESCUE_NO_WINDOW_CONFIDENCE = 50;

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type ShareLinkCandidate = {
  id: string;
  sales_id: string;
  client_id: string | null;
  client_full_name: string | null;
  opened_at: string; // ISO
  /** Nombre completo del comercial dueño del enlace. Necesario para el
   *  rescate por mención (ver `attributeReview`). Si no se enriquece, ese
   *  candidato simplemente no se considera para la detección de mención. */
  sales_full_name?: string | null;
};

/**
 * Roster mínimo de comerciales de una ficha. Lo usa el rescate por mención
 * cuando el texto nombra a un comercial que NO tiene ningún enlace abierto en
 * la ventana temporal (decisión de producto: pre-asignar igual, sin cliente).
 */
export type CommercialInfo = {
  sales_id: string;
  full_name: string;
};

export type ReviewInput = {
  google_review_id: string;
  /** Nombre tal cual lo devuelve Google. Si Google no devolvió nombre,
   *  pasar el fallback ("Anónimo" o equivalente) Y poner `hasAuthorName:
   *  false` para que el matcher use modo temporal-only. */
  author_name: string;
  /** Si false, el matcher ignora la similitud de nombre y se apoya solo
   *  en la ventana temporal corta. Default true (asume nombre real). */
  hasAuthorName?: boolean;
  /** Texto/comentario de la reseña, si lo hay. Se usa SOLO para el rescate
   *  por mención del comercial (ver `attributeReview`). */
  text?: string | null;
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
    const authorSecond = authorTokens[1];
    if (clientLast && authorSecond) {
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

/**
 * ¿El texto de la reseña menciona el nombre del comercial?
 *
 * Coincidencia por TOKEN COMPLETO sobre el texto normalizado (no substring,
 * así "Tono" no casa dentro de "monótono"). Decisión de producto: casa el
 * nombre de pila O cualquier apellido (cualquier token ≥ MIN_MENTION_TOKEN_LEN
 * del nombre del comercial que aparezca como palabra en el texto).
 */
export function mentionsCommercial(
  text: string | null | undefined,
  fullName: string | null | undefined,
): boolean {
  if (!text || !fullName) return false;
  const nameTokens = tokenize(fullName).filter(
    (t) => t.length >= MIN_MENTION_TOKEN_LEN,
  );
  if (nameTokens.length === 0) return false;
  const textTokens = new Set(tokenize(text));
  return nameTokens.some((t) => textTokens.has(t));
}

// ─── Núcleo del matcher ─────────────────────────────────────────────────────

/**
 * Punto de entrada del matcher.
 *
 * No hace I/O: el caller (cron) le pasa los candidatos ya filtrados por
 * `location_id` y por `opened_at >= review.created - TEMPORAL_WINDOW_HOURS`,
 * y opcionalmente el roster de comerciales de la ficha (para el rescate por
 * mención cuando no hay enlace en ventana).
 *
 * Estrategia en dos pasos:
 *   1. Atribución normal por nombre del cliente + ventana temporal
 *      (`primaryAttribution`). Es la única vía que puede dar `counted`.
 *   2. Si esa vía se quedaría en `unmatched`, intento de rescate por mención
 *      del comercial en el texto (`rescueByCommercialMention`). Solo puede dar
 *      `pending` — nunca atribuye en automático.
 */
export function attributeReview(
  review: ReviewInput,
  candidates: ShareLinkCandidate[],
  commercials: CommercialInfo[] = [],
): MatchResult {
  const primary = primaryAttribution(review, candidates);
  if (primary.match_state !== "unmatched") return primary;
  const rescued = rescueByCommercialMention(review, candidates, commercials);
  return rescued ?? primary;
}

/**
 * Dada una reseña y la lista de share_links de la misma ficha en la ventana
 * temporal previa, escoge el mejor candidato (si lo hay) y devuelve el
 * resultado del matching por nombre + tiempo.
 */
function primaryAttribution(
  review: ReviewInput,
  candidates: ShareLinkCandidate[],
): MatchResult {
  const reviewMs = new Date(review.google_created_at).getTime();
  const hasAuthorName = review.hasAuthorName !== false;

  // Modo temporal-only: cuando Google no nos da nombre real, no podemos
  // hacer name match. Si hay UN único candidato en la ventana corta
  // (≤ TEMPORAL_BONUS_HOURS), lo dejamos como 'pending' para verificación
  // manual con confianza moderada. Mejor que tirar todas a unmatched.
  if (!hasAuthorName) {
    const nearby = candidates.filter((c) => {
      const openedMs = new Date(c.opened_at).getTime();
      if (openedMs > reviewMs) return false;
      const hoursDelta = (reviewMs - openedMs) / 3_600_000;
      return hoursDelta <= TEMPORAL_BONUS_HOURS;
    });
    if (nearby.length === 1) {
      const c = nearby[0]!;
      const hoursDelta = (reviewMs - new Date(c.opened_at).getTime()) / 3_600_000;
      return {
        match_state: "pending",
        match_confidence: 50,
        match_evidence: {
          reason: "anonymous_author_single_temporal_match",
          share_link_id: c.id,
          client_full_name: c.client_full_name,
          hours_delta: Number(hoursDelta.toFixed(2)),
          candidates_considered: candidates.length,
        },
        sales_id: c.sales_id,
        client_id: c.client_id ?? undefined,
        share_link_id: c.id,
      };
    }
    return {
      match_state: "unmatched",
      match_confidence: 0,
      match_evidence: {
        reason:
          nearby.length === 0
            ? "anonymous_author_no_nearby_candidates"
            : `anonymous_author_multiple_candidates (${nearby.length})`,
        candidates_considered: candidates.length,
        window_hours: TEMPORAL_BONUS_HOURS,
      },
    };
  }

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

/**
 * Rescate por mención del comercial en el texto de la reseña.
 *
 * Se invoca solo cuando la atribución normal se quedaría en `unmatched`.
 * Devuelve siempre `pending` (nunca `counted`) o `null` si no rescata.
 *
 * Dos niveles:
 *   - Tier 1 — el comercial mencionado tiene un enlace abierto en la ventana
 *     temporal: pre-asignamos a ese comercial + el cliente del mejor candidato
 *     (mayor parecido de nombre; desempate por cercanía temporal).
 *   - Tier 2 — el comercial mencionado NO tiene enlace en ventana pero está en
 *     el roster de la ficha: pre-asignamos al comercial SIN cliente (decisión
 *     de producto: el comercial nombrado es señal suficiente para que un
 *     humano lo revise).
 *
 * En ambos niveles, si el texto menciona a MÁS DE UN comercial distinto de
 * forma ambigua, no adivinamos → `null` (queda unmatched).
 */
function rescueByCommercialMention(
  review: ReviewInput,
  candidates: ShareLinkCandidate[],
  commercials: CommercialInfo[],
): MatchResult | null {
  const text = review.text;
  if (!text) return null;
  const reviewMs = new Date(review.google_created_at).getTime();

  // Candidatos cuyo enlace cae en ventana Y cuyo comercial se menciona.
  const inWindowMentioned = candidates.filter((c) => {
    const openedMs = new Date(c.opened_at).getTime();
    if (openedMs > reviewMs) return false; // enlace posterior a la reseña
    const hoursDelta = (reviewMs - openedMs) / 3_600_000;
    if (hoursDelta > TEMPORAL_WINDOW_HOURS) return false;
    return mentionsCommercial(text, c.sales_full_name);
  });

  const distinctSalesInWindow = new Set(
    inWindowMentioned.map((c) => c.sales_id),
  );

  // Tier 1: exactamente un comercial mencionado con enlace en ventana.
  if (distinctSalesInWindow.size === 1) {
    let best: {
      candidate: ShareLinkCandidate;
      nameScore: number;
      hoursDelta: number;
    } | null = null;
    for (const c of inWindowMentioned) {
      const nameScore = c.client_full_name
        ? nameSimilarity(c.client_full_name, review.author_name)
        : 0;
      const hoursDelta =
        (reviewMs - new Date(c.opened_at).getTime()) / 3_600_000;
      if (
        !best ||
        nameScore > best.nameScore ||
        (nameScore === best.nameScore && hoursDelta < best.hoursDelta)
      ) {
        best = { candidate: c, nameScore, hoursDelta };
      }
    }
    if (!best) return null;
    // Confianza acotada estrictamente por debajo de AUTO_THRESHOLD: el
    // rescate por mención jamás cuenta en automático.
    const confidence = Math.min(
      AUTO_THRESHOLD - 5,
      MENTION_RESCUE_CONFIDENCE +
        (best.hoursDelta <= TEMPORAL_BONUS_HOURS ? 8 : 0),
    );
    return {
      match_state: "pending",
      match_confidence: confidence,
      match_evidence: {
        reason: "rescued_by_commercial_mention_in_window",
        share_link_id: best.candidate.id,
        commercial_name: best.candidate.sales_full_name,
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

  // Más de un comercial mencionado con enlace en ventana → ambiguo.
  if (distinctSalesInWindow.size > 1) return null;

  // Tier 2: ningún comercial mencionado tiene enlace en ventana. Buscamos en
  // el roster de la ficha. Solo pre-asignamos si hay EXACTAMENTE uno.
  const mentionedRoster = commercials.filter((c) =>
    mentionsCommercial(text, c.full_name),
  );
  const distinctRoster = new Set(mentionedRoster.map((c) => c.sales_id));
  if (distinctRoster.size === 1) {
    const c = mentionedRoster[0]!;
    return {
      match_state: "pending",
      match_confidence: MENTION_RESCUE_NO_WINDOW_CONFIDENCE,
      match_evidence: {
        reason: "rescued_by_commercial_mention_no_window",
        commercial_name: c.full_name,
        review_author: review.author_name,
        candidates_considered: candidates.length,
        roster_size: commercials.length,
      },
      sales_id: c.sales_id,
      // client_id ausente a propósito: sin enlace en ventana no hay cliente
      // identificable. Lo asigna el humano al confirmar.
    };
  }

  return null;
}
