import { z } from "zod";
import type { Role } from "@/lib/supabase/types";

/**
 * Gating de la bandeja de respuestas (/resenas/respuestas). Función pura
 * para defensa en profundidad por encima de la RLS. Solo el gestor (José) y
 * los admin responden reseñas; office_director y sales NO (decisión de
 * producto, ver CLAUDE.md §4.48).
 */
export function canReplyToReviews(role: Role | null | undefined): boolean {
  return role === "admin" || role === "reviews_manager";
}

/**
 * Texto de la respuesta. Límite 4096 = tope de Google para la respuesta del
 * propietario. NO se sanea ni se filtran caracteres: los emojis son Unicode
 * válido y deben conservarse intactos.
 */
export const replyTextSchema = z
  .string()
  .trim()
  .min(1, "La respuesta no puede estar vacía.")
  .max(4096, "La respuesta supera el límite de Google (4096 caracteres).");

export const saveReplySchema = z.object({
  reviewId: z.string().uuid(),
  text: replyTextSchema,
});

export type SaveReplyInput = z.input<typeof saveReplySchema>;

/**
 * True si la reseña ya está respondida. Usado por el filtro de pestañas
 * (Sin responder / Respondidas) y por el contador de pendientes.
 */
export function isReplied(review: { replied_at: string | null }): boolean {
  return review.replied_at !== null;
}
