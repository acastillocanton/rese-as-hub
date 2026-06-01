/**
 * Helpers de formato/etiquetado de uso transversal en la UI. Centraliza lo que
 * estaba repetido en varias pantallas (formato de fecha de reseña, etiquetas y
 * tonos del match_state).
 */

/** Fecha en formato "05 jun 2026" (es-ES). Reutilizada en reseñas y fichas. */
export function formatReviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Fecha + hora corta "05 jun, 14:30" (es-ES). Para actividad reciente. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function matchStateLabel(state: string): string {
  if (state === "counted") return "Contada";
  if (state === "pending") return "Por verificar";
  if (state === "manual") return "Manual";
  if (state === "unmatched") return "Sin atribuir";
  return state;
}

export function matchStateTone(state: string): "ok" | "warn" | "neutral" {
  if (state === "counted" || state === "manual") return "ok";
  if (state === "pending") return "warn";
  return "neutral";
}
