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
 * Atribución por mención del comercial (ver `attributeByCommercialMention`).
 *
 * En este negocio la relación es PERSONAL con el comercial, así que la reseña
 * casi siempre nombra al comercial ("Tono es muy buen comercial"), mientras
 * que el nombre del autor en Google rara vez coincide con el que el comercial
 * dio de alta como cliente ("Maf" vs "Marta Ferrer").
 *
 * Decisión de producto (2026-06-02 — revisa la anterior decisión anti-fraude
 * de §4.38): si el cliente NOMBRA a su comercial en el texto, esa es la señal
 * más fiable que tenemos y BASTA para contar en automático (`counted`). Antes
 * la mención solo subía a `pending`. Racional: la comisión se atribuye por
 * comercial × reseña, y la mención resuelve justo el "a qué comercial"; el
 * cliente exacto es secundario (lo afina el humano/comercial después, ver
 * §4.38). Por eso las confianzas aquí son >= AUTO_THRESHOLD.
 *
 * Guardrail que SE MANTIENE: si el texto nombra a MÁS DE UN comercial distinto,
 * es ambiguo y NO contamos — salvo el desempate por rol de abajo.
 *
 * Desempate por rol (2026-06-10, §4.38): cuando los mencionados son un
 * COMERCIAL (`sales`) y uno o varios DIRECTORES (`office_director`), se atribuye
 * al comercial (es quien produce; el director es supervisión). Solo resuelve si
 * queda EXACTAMENTE UN `sales`; con 0 ó ≥2 `sales` sigue siendo ambiguo → null.
 */
/** Token mínimo del nombre del comercial que cuenta como mención (evita que
 *  partículas tipo "de"/"la" o iniciales sueltas disparen falsos positivos). */
const MIN_MENTION_TOKEN_LEN = 3;
/** Confianza cuando el comercial mencionado SÍ tiene un enlace abierto en la
 *  ventana temporal (hay cliente candidato). */
const MENTION_COUNT_CONFIDENCE = 85;
/** Confianza cuando el comercial mencionado NO tiene enlace en ventana pero
 *  está en el roster de la ficha (se cuenta al comercial, sin cliente). */
const MENTION_COUNT_NO_WINDOW_CONFIDENCE = 78;

/**
 * Atribución por proximidad temporal a un ÚNICO comercial (ver
 * `attributeBySingleCommercialInWindow`).
 *
 * Caso real (Cornel, 2026-06): un cliente abre el enlace PERSONAL del comercial
 * (`/c/{slug}`, sin cliente concreto → `client_id = null`) y deja la reseña
 * segundos después, pero el nombre del autor no casa con ningún cliente y la
 * reseña no tiene texto que mencione al comercial. Hoy eso cae a `unmatched`
 * aunque la `share_link` ya identifica al comercial con certeza.
 *
 * Decisión de producto (2026-06-08): si en una ventana corta hay clics de
 * EXACTAMENTE UN comercial, se PROPONE ese comercial. **Desde 2026-06-10 entra
 * como `pending`, NO `counted`** (§4.47): el clic es solo coincidencia temporal,
 * no causal (Google no nos dice qué reseña vino de qué clic, §4.38), y un clic
 * genérico en ráfaga generaba falsos positivos cross-mercado que se PAGABAN
 * solos. Ahora un humano confirma en Verificación antes de que cuente. El
 * cliente exacto también lo afina el humano. Reversible.
 *
 * Guardrail duro: si en la ventana hay clics de >1 comercial distinto, es
 * ambiguo y NO proponemos. La ventana corta evita capturar reseñas orgánicas.
 */
/** Ventana corta para la atribución por proximidad a un ÚNICO comercial
 *  (cuando ni el nombre ni la mención resuelven la reseña). 30 min: el flujo
 *  real "clic → reseña" ocurre en minutos (el caso Eduuu fueron 12 s); una
 *  ventana más ancha capturaba reseñas orgánicas como propias. Se bajó de 12h
 *  a 0.5h el 2026-06-08 tras un falso positivo en prod (reseña orgánica
 *  atribuida a Cornel por un clic genérico 3h antes). Ver §4.47. */
const SINGLE_COMMERCIAL_TEMPORAL_WINDOW_HOURS = 0.5;
/** Confianza de la propuesta temporal-only. Es la señal más débil (no hay
 *  nombre ni mención); por eso entra como `pending` (la confirma un humano),
 *  no `counted`. El comercial está identificado por su propio enlace, pero el
 *  clic es coincidencia temporal, no prueba de autoría. */
const SINGLE_COMMERCIAL_TEMPORAL_CONFIDENCE = 70;

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
  /** Rol del productor en la ficha. Se usa para desempatar menciones
   *  ambiguas: si el texto nombra a un COMERCIAL (`sales`) Y a un DIRECTOR
   *  (`office_director`), se atribuye al comercial, no al director (decisión
   *  de producto 2026-06-10, §4.38 — el comercial es quien produce sobre el
   *  terreno; el director es supervisión, "nos curamos en salud"). Opcional
   *  por compatibilidad: si falta, no se aplica la preferencia. */
  role?: "sales" | "office_director";
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
 *      (`primaryAttribution`).
 *   2. Atribución por mención del comercial en el texto
 *      (`attributeByCommercialMention`). Si el texto nombra inequívocamente a
 *      un comercial, manda y cuenta en automático (`counted`) — puede tanto
 *      rescatar un `unmatched` como elevar un `pending` por nombre débil. Un
 *      match por nombre ya sólido (`counted`) no se toca.
 */
export function attributeReview(
  review: ReviewInput,
  candidates: ShareLinkCandidate[],
  commercials: CommercialInfo[] = [],
): MatchResult {
  const primary = primaryAttribution(review, candidates);
  // Un match por nombre+tiempo ya sólido no se altera.
  if (primary.match_state === "counted") return primary;
  // En pending o unmatched, la mención del comercial manda: si es inequívoca,
  // cuenta en automático. Si no hay mención (o es ambigua), nos quedamos con el
  // resultado por nombre+tiempo.
  const byMention = attributeByCommercialMention(review, candidates, commercials);
  if (byMention) return byMention;
  // Último recurso: si seguimos en unmatched y en una ventana corta hubo clics
  // de UN único comercial, atribuir a ese comercial por proximidad temporal.
  // Solo para autores con nombre — los anónimos conservan su path dedicado
  // (`primaryAttribution` modo temporal-only) para no alterar su comportamiento.
  if (review.hasAuthorName !== false && primary.match_state === "unmatched") {
    const byTemporal = attributeBySingleCommercialInWindow(review, candidates);
    if (byTemporal) return byTemporal;
  }
  return primary;
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
 * Atribución por mención del comercial en el texto de la reseña.
 *
 * Se invoca cuando la atribución normal NO dio ya un `counted` sólido (es
 * decir, quedó en `pending` o `unmatched`). Devuelve `counted` si el texto
 * nombra inequívocamente a un comercial, o `null` si no hay mención clara.
 *
 * Dos niveles:
 *   - Tier 1 — el comercial mencionado tiene un enlace abierto en la ventana
 *     temporal: cuenta a ese comercial + el cliente del mejor candidato
 *     (mayor parecido de nombre; desempate por cercanía temporal).
 *   - Tier 2 — el comercial mencionado NO tiene enlace en ventana pero está en
 *     el roster de la ficha: cuenta al comercial SIN cliente (la comisión es
 *     por comercial; el cliente exacto lo afina el humano/comercial luego).
 *
 * En ambos niveles, si el texto menciona a MÁS DE UN comercial distinto, no
 * adivinamos → `null` — salvo el desempate comercial>director
 * (`resolveMentionBySalesPreference`).
 */
function attributeByCommercialMention(
  review: ReviewInput,
  candidates: ShareLinkCandidate[],
  commercials: CommercialInfo[],
): MatchResult | null {
  const text = review.text;
  if (!text) return null;
  const reviewMs = new Date(review.google_created_at).getTime();

  // Rol por sales_id (desde el roster) para el desempate comercial>director.
  const roleById = new Map<string, "sales" | "office_director">();
  for (const c of commercials) {
    if (c.role) roleById.set(c.sales_id, c.role);
  }

  // Candidatos cuyo enlace cae en ventana Y cuyo comercial se menciona.
  const inWindowMentioned = candidates.filter((c) => {
    const openedMs = new Date(c.opened_at).getTime();
    if (openedMs > reviewMs) return false; // enlace posterior a la reseña
    const hoursDelta = (reviewMs - openedMs) / 3_600_000;
    if (hoursDelta > TEMPORAL_WINDOW_HOURS) return false;
    return mentionsCommercial(text, c.sales_full_name);
  });

  // Tier 1: comercial mencionado con enlace en ventana. Si hay varios, el
  // desempate comercial>director intenta resolver a un único `sales`.
  if (inWindowMentioned.length > 0) {
    const resolved = resolveMentionBySalesPreference(
      inWindowMentioned.map((c) => c.sales_id),
      roleById,
    );
    if (!resolved) return null; // ambiguo no resoluble por preferencia
    let best: {
      candidate: ShareLinkCandidate;
      nameScore: number;
      hoursDelta: number;
    } | null = null;
    for (const c of inWindowMentioned) {
      if (c.sales_id !== resolved.salesId) continue;
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
    // La mención del comercial cuenta en automático. Confianza alta, con
    // pequeño bonus si además el nombre casa o la ventana es muy corta.
    const confidence = Math.min(
      98,
      MENTION_COUNT_CONFIDENCE +
        (best.nameScore >= 55 ? 5 : 0) +
        (best.hoursDelta <= TEMPORAL_BONUS_HOURS ? 5 : 0),
    );
    return {
      match_state: "counted",
      match_confidence: confidence,
      match_evidence: {
        reason: "counted_by_commercial_mention_in_window",
        share_link_id: best.candidate.id,
        commercial_name: best.candidate.sales_full_name,
        client_full_name: best.candidate.client_full_name,
        review_author: review.author_name,
        name_score: best.nameScore,
        hours_delta: Number(best.hoursDelta.toFixed(2)),
        candidates_considered: candidates.length,
        ...(resolved.viaPreference
          ? { resolved_by_sales_preference: true }
          : {}),
      },
      sales_id: best.candidate.sales_id,
      client_id: best.candidate.client_id ?? undefined,
      share_link_id: best.candidate.id,
    };
  }

  // Tier 2: ningún comercial mencionado tiene enlace en ventana. Buscamos en
  // el roster de la ficha. Pre-asignamos si hay EXACTAMENTE uno, o si el
  // desempate comercial>director resuelve a un único `sales`.
  const mentionedRoster = commercials.filter((c) =>
    mentionsCommercial(text, c.full_name),
  );
  const resolved = resolveMentionBySalesPreference(
    mentionedRoster.map((c) => c.sales_id),
    roleById,
  );
  if (resolved) {
    const c = mentionedRoster.find((x) => x.sales_id === resolved.salesId)!;
    return {
      match_state: "counted",
      match_confidence: MENTION_COUNT_NO_WINDOW_CONFIDENCE,
      match_evidence: {
        reason: "counted_by_commercial_mention_no_window",
        commercial_name: c.full_name,
        review_author: review.author_name,
        candidates_considered: candidates.length,
        roster_size: commercials.length,
        ...(resolved.viaPreference
          ? { resolved_by_sales_preference: true }
          : {}),
      },
      sales_id: c.sales_id,
      // client_id ausente a propósito: sin enlace en ventana no hay cliente
      // identificable. Lo asigna el humano al confirmar.
    };
  }

  return null;
}

/**
 * Resuelve un conjunto (posiblemente ambiguo) de comerciales mencionados a un
 * único sales_id aplicando la preferencia COMERCIAL > DIRECTOR (§4.38):
 *   - 0 mencionados → null.
 *   - 1 mencionado → ese (sin preferencia: `viaPreference=false`).
 *   - >1 pero exactamente uno con role 'sales' → ese (`viaPreference=true`);
 *     los `office_director` se descartan como desempate.
 *   - >1 con 0 ó ≥2 'sales' → null (sigue ambiguo: no adivinamos).
 * `roleById` mapea sales_id → role desde el roster (vacío → no hay preferencia
 * posible, así que solo resuelve el caso de 1 mención).
 */
function resolveMentionBySalesPreference(
  salesIds: string[],
  roleById: Map<string, "sales" | "office_director">,
): { salesId: string; viaPreference: boolean } | null {
  const distinct = [...new Set(salesIds)];
  if (distinct.length === 0) return null;
  if (distinct.length === 1) return { salesId: distinct[0]!, viaPreference: false };
  const salesOnly = distinct.filter((id) => roleById.get(id) === "sales");
  if (salesOnly.length === 1) return { salesId: salesOnly[0]!, viaPreference: true };
  return null;
}

/**
 * Atribución por proximidad temporal a un ÚNICO comercial.
 *
 * Último recurso cuando ni el nombre del autor ni una mención en el texto han
 * resuelto la reseña. Si en una ventana corta
 * (`SINGLE_COMMERCIAL_TEMPORAL_WINDOW_HOURS`) hubo clics de EXACTAMENTE UN
 * comercial, PROPONE ese comercial en `pending` (NO cuenta solo), SIN cliente:
 * la `share_link` identifica al comercial, pero el clic es solo coincidencia
 * temporal — un humano confirma en Verificación antes de que pague (§4.47).
 *
 * Devuelve `null` si no hay clics en ventana o si hay clics de más de un
 * comercial distinto (ambiguo → no adivinamos; ver §4.38). El caller solo la
 * invoca para autores con nombre y cuando seguimos en `unmatched`.
 */
function attributeBySingleCommercialInWindow(
  review: ReviewInput,
  candidates: ShareLinkCandidate[],
): MatchResult | null {
  const reviewMs = new Date(review.google_created_at).getTime();

  const inWindow = candidates.filter((c) => {
    const openedMs = new Date(c.opened_at).getTime();
    if (openedMs > reviewMs) return false; // enlace posterior a la reseña
    const hoursDelta = (reviewMs - openedMs) / 3_600_000;
    return hoursDelta <= SINGLE_COMMERCIAL_TEMPORAL_WINDOW_HOURS;
  });

  if (inWindow.length === 0) return null;
  const distinctSales = new Set(inWindow.map((c) => c.sales_id));
  if (distinctSales.size !== 1) return null; // ambiguo: varios comerciales

  // Un único comercial. Elegimos el clic más cercano en el tiempo (mejor
  // evidencia / para registrar el share_link_id).
  let best = inWindow[0]!;
  let bestDelta = (reviewMs - new Date(best.opened_at).getTime()) / 3_600_000;
  for (const c of inWindow) {
    const d = (reviewMs - new Date(c.opened_at).getTime()) / 3_600_000;
    if (d < bestDelta) {
      best = c;
      bestDelta = d;
    }
  }

  return {
    // PENDING, no counted (cambio 2026-06-10, §4.47): el clic-temporal es la
    // señal MÁS DÉBIL (ni nombre ni mención) y un clic genérico en ráfaga
    // generaba falsos positivos cross-mercado que se PAGABAN solos (p.ej. una
    // reseña rusa atribuida a una comercial del mercado rumano). Ahora propone
    // el comercial pero NO cuenta hasta que un humano confirma en Verificación.
    match_state: "pending",
    match_confidence: SINGLE_COMMERCIAL_TEMPORAL_CONFIDENCE,
    match_evidence: {
      reason: "single_commercial_temporal_pending",
      share_link_id: best.id,
      commercial_id: best.sales_id,
      review_author: review.author_name,
      hours_delta: Number(bestDelta.toFixed(2)),
      candidates_considered: candidates.length,
      window_hours: SINGLE_COMMERCIAL_TEMPORAL_WINDOW_HOURS,
    },
    sales_id: best.sales_id,
    // client_id ausente a propósito: ningún candidato tenía buen parecido de
    // nombre (primary < PENDING_THRESHOLD), así que adivinar cliente sería
    // arriesgado (anti-fraude mig 015). Lo afina el humano al confirmar.
    share_link_id: best.id,
  };
}
