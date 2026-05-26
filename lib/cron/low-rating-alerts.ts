/**
 * Lógica pura de alertas tempranas por reseñas con rating bajo (≤2★).
 *
 * El cron procesa reseñas frescas y, además de la notificación habitual
 * al comercial atribuido (que se hace para cualquier rating), encola una
 * alerta separada cuando `rating ≤ LOW_RATING_THRESHOLD`. Esta alerta va
 * a múltiples destinatarios: admin + reviews_manager + (si counted/pending)
 * director responsable + sales atribuido.
 *
 * Ver CLAUDE.md §4.29 para el flujo completo.
 *
 * Mantener este módulo **sin I/O** facilita los tests unit (no necesita
 * mocks de Supabase ni de SMTP).
 */

import type { MatchState, ProfileStatus } from "@/lib/supabase/types";

/** Reseñas con rating ≤ este valor disparan alerta. 1★ y 2★ por
 *  decisión de producto (las 3★ se consideran tibias pero no críticas). */
export const LOW_RATING_THRESHOLD = 2;

/** Devuelve true si el rating califica como "bajo" y dispara alerta. */
export function isLowRating(rating: number): boolean {
  return Number.isFinite(rating) && rating > 0 && rating <= LOW_RATING_THRESHOLD;
}

export type SalesLite = {
  id: string;
  email: string | null;
  status: ProfileStatus;
  director_id: string | null;
};

export type ProfileLite = {
  id: string;
  email: string | null;
  status: ProfileStatus;
};

/**
 * Resuelve la lista de emails a notificar para una alerta ≤2★. Reglas:
 *
 *   • admin + reviews_manager activos: SIEMPRE (independiente del
 *     match_state). Si no hay ninguno activo, la alerta no se envía.
 *   • sales atribuido: solo si counted/pending, email no null,
 *     status='active'.
 *   • director del sales: solo si counted/pending, sales.director_id
 *     no null, director activo con email.
 *   • unmatched: omite sales y director (no se sabe a quién atribuir).
 *
 * Dedupe por email case-insensitive. El caso "director productor dual"
 * (un director que es el propio sales atribuido por ser productor) cae
 * de forma natural en el dedupe: ambos profiles tendrán el mismo email.
 */
export function resolveLowRatingRecipients(params: {
  matchState: MatchState;
  sales: SalesLite | null;
  director: ProfileLite | null;
  admins: ProfileLite[];
  managers: ProfileLite[];
}): string[] {
  const out: string[] = [];

  const pushIfEligible = (p: ProfileLite | null, requireActive: boolean) => {
    if (!p) return;
    if (!p.email) return;
    if (requireActive && p.status !== "active") return;
    out.push(p.email);
  };

  // Admins y managers: siempre incluidos si están activos. Un admin
  // archivado/paused no debería recibir notificaciones de producción.
  for (const a of params.admins) pushIfEligible(a, true);
  for (const m of params.managers) pushIfEligible(m, true);

  // Sales y director: solo si la reseña está atribuida.
  if (params.matchState === "counted" || params.matchState === "pending") {
    if (params.sales) {
      pushIfEligible(
        { id: params.sales.id, email: params.sales.email, status: params.sales.status },
        true,
      );
    }
    pushIfEligible(params.director, true);
  }

  // Dedupe case-insensitive preservando el formato del primero visto.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const email of out) {
    const key = email.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    unique.push(email.trim());
  }
  return unique;
}

/** Payload de alerta que viaja desde `processFreshReviews` hasta el
 *  flush en `sync-places.ts` / cron Business Profile. */
export type LowRatingAlert = {
  reviewId: string;
  rating: number;
  authorName: string;
  reviewText: string | null;
  locationId: string;
  locationName: string;
  placeId: string | null;
  matchState: MatchState;
  salesId: string | null;
  clientId: string | null;
};
