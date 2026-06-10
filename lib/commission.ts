/**
 * Cálculo del importe de comisión con TOPE de reseñas bonificables
 * (mig 026, CLAUDE.md §4.49). Única fuente de verdad — reutilizado por el
 * panel del comercial, la ficha de gestión (ProducerSummary) y el Excel
 * individual. Funciones puras, sin I/O → testeables.
 *
 * Modelo: a un productor (sales / office_director) se le abona comisión por
 * un MÁXIMO de `cap` reseñas verificadas (counted) por periodo de comisión.
 * El comercial puede tener más abonables, pero solo se pagan hasta el tope.
 *
 * `cap`:
 *   • null → sin tope (paga todas las counted; comportamiento legacy).
 *   • int  → tope de reseñas bonificables por periodo.
 * `rate` (€/reseña):
 *   • null → tarifa no configurada → el € es null (la UI muestra "—").
 */

/** Reseñas que efectivamente se pagan: min(counted, cap), o counted si no hay tope. */
export function payableCount(counted: number, cap: number | null): number {
  if (cap === null) return counted;
  return Math.min(counted, Math.max(0, cap));
}

/** Importe de comisión abonable: rate × payableCount. null si no hay tarifa. */
export function commissionEuro(
  counted: number,
  rate: number | null,
  cap: number | null,
): number | null {
  if (rate === null) return null;
  return rate * payableCount(counted, cap);
}

/**
 * Importe MARGINAL que sumarían las `pending` si se verifican, respetando el
 * tope. Si ya se está en el tope con las counted, las pending no añaden nada.
 * null si no hay tarifa.
 */
export function pendingCommissionEuro(
  counted: number,
  pending: number,
  rate: number | null,
  cap: number | null,
): number | null {
  if (rate === null) return null;
  const incremental =
    payableCount(counted + pending, cap) - payableCount(counted, cap);
  return rate * Math.max(0, incremental);
}

/** True si hay reseñas abonables por encima del tope (excedente no pagado). */
export function isCapped(counted: number, cap: number | null): boolean {
  return cap !== null && counted > cap;
}
