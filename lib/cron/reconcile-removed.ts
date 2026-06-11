/**
 * Lógica pura del soft-delete automático de reseñas borradas en Google
 * (§4.20, reactivado 2026-06-11 con Business Profile como fuente única).
 *
 * Invariante de ventana: la API v4 lista por `updateTime` desc, así que un
 * fetch (prefijo de ese orden) contiene TODAS las reseñas de la ficha con
 * `updateTime >= min(updateTime bajado)`. Como updateTime >= createTime, una
 * fila de BD con `google_created_at > minFetchedUpdateTime` debería aparecer
 * sí o sí en el fetch — si no aparece, ha desaparecido de Google. (El caller
 * acota los candidatos con ese filtro; aquí solo se decide.)
 *
 * Capa anti-falsos-positivos (la lección de Places, §4.20): la primera
 * ausencia solo SELLA `missing_since`. El soft-delete (`removed_at`) llega
 * únicamente si la reseña sigue ausente pasado `thresholdHours` (≥ varios
 * runs del cron horario). Si reaparece antes, se limpia el sello.
 *
 * Módulo SIN I/O — misma separación que `edit-merge.ts` / `duplicate-detection.ts`.
 */

/** Umbral de ausencia sostenida antes de marcar removed_at. 24h cubre con
 *  holgura el hueco nocturno del cron horario (06-23 UTC) y exige que la
 *  ausencia se confirme en muchos runs consecutivos. */
export const AUTO_REMOVE_THRESHOLD_HOURS = 24;

/** Fila candidata: BP, no eliminada, dentro de la ventana del fetch. */
export type ReconcileCandidate = {
  id: string;
  google_review_id: string;
  missing_since: string | null;
};

export type ReconcileDecision = {
  /** Estaban selladas como ausentes pero han reaparecido → limpiar missing_since. */
  reappeared: string[];
  /** Primera ausencia → sellar missing_since = now. */
  firstMiss: string[];
  /** Ausencia sostenida más allá del umbral → soft-delete (removed_at = now). */
  toRemove: string[];
};

export function decideReconcileRemoved(p: {
  candidates: ReconcileCandidate[];
  /** google_review_id presentes en el fetch actual. */
  fetchedIds: Set<string>;
  nowIso: string;
  thresholdHours?: number;
}): ReconcileDecision {
  const threshold = p.thresholdHours ?? AUTO_REMOVE_THRESHOLD_HOURS;
  const nowMs = new Date(p.nowIso).getTime();
  const out: ReconcileDecision = { reappeared: [], firstMiss: [], toRemove: [] };

  for (const c of p.candidates) {
    if (p.fetchedIds.has(c.google_review_id)) {
      if (c.missing_since !== null) out.reappeared.push(c.id);
      continue;
    }
    if (c.missing_since === null) {
      out.firstMiss.push(c.id);
      continue;
    }
    const missingHours = (nowMs - new Date(c.missing_since).getTime()) / 3_600_000;
    if (missingHours >= threshold) out.toRemove.push(c.id);
    // Si aún no supera el umbral: esperar (no tocar nada).
  }

  return out;
}
