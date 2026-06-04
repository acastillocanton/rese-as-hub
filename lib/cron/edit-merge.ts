/**
 * Lógica pura de "fusión por autor" — detecta cuándo una reseña fresca es en
 * realidad una EDICIÓN de una reseña que ya tenemos, no una nueva.
 *
 * Contexto: Google permite **una sola reseña por persona y negocio**. El sync
 * vía Places API legacy no recibe un `reviewId` estable, así que sintetizamos
 * `google_review_id = places:{place_id}_{unix_time}_{md5_8(autor)}`. Cuando el
 * autor EDITA su reseña (p.ej. 1★→5★), Google cambia el timestamp → cambia el
 * id sintético → el cron la trataría como NUEVA e insertaría una fila fantasma
 * (que luego el anti-fraude mig 015 marca como duplicada, dejando la vieja como
 * principal). Para evitarlo: si llega una reseña de un autor (no anónimo) que YA
 * existe en esa ficha, es la misma reseña editada → actualizamos la fila
 * existente en vez de insertar. Ver CLAUDE.md §4.41.
 *
 * Este módulo es SIN I/O (la query de incumbentes y el UPDATE viven en
 * `process-reviews.ts`); solo decide. Igual separación que
 * `duplicate-detection.ts::decideFromPrincipals`.
 */

import { isLowRating } from "@/lib/cron/low-rating-alerts";

/** Datos mínimos de una reseña existente del mismo autor+ficha. */
export type IncumbentLite = {
  id: string;
  rating: number;
  removed_at: string | null;
  low_rating_alerted_at: string | null;
};

export type EditMergeDecision =
  | { action: "insert" }
  | {
      action: "merge";
      incumbentId: string;
      /** El incumbente estaba soft-deleted y la edición lo "revive". */
      clearRemovedAt: boolean;
      /** La edición baja el rating a ≤2★ por primera vez → re-alertar. */
      reAlertLowRating: boolean;
    };

/**
 * Decide si una reseña fresca debe FUSIONARSE con un incumbente (misma
 * persona, misma ficha → misma reseña editada) o insertarse como nueva.
 *
 *   - Autor anónimo → siempre insert (no se puede identificar a la persona).
 *   - 0 incumbentes → insert (es genuinamente nueva).
 *   - ≥2 incumbentes → insert (ambigüedad legacy; no adivinamos a cuál fusionar.
 *     Tras la limpieza one-shot el estado estable es ≤1 incumbente por autor).
 *   - exactamente 1 → merge.
 *
 * `reAlertLowRating` solo es true si el rating ENTRANTE es bajo, el del
 * incumbente NO lo era, y aún no se había alertado (evita spam al editar entre
 * ratings ya bajos o re-alertar lo ya alertado).
 */
export function decideEditMerge(p: {
  hasAuthorName: boolean;
  incumbents: IncumbentLite[];
  incomingRating: number;
}): EditMergeDecision {
  if (!p.hasAuthorName) return { action: "insert" };
  if (p.incumbents.length !== 1) return { action: "insert" };
  const [inc] = p.incumbents;
  if (!inc) return { action: "insert" };

  const clearRemovedAt = inc.removed_at !== null;
  const reAlertLowRating =
    isLowRating(p.incomingRating) &&
    !isLowRating(inc.rating) &&
    inc.low_rating_alerted_at === null;

  return { action: "merge", incumbentId: inc.id, clearRemovedAt, reAlertLowRating };
}
