import { z } from "zod";
import type { Role } from "@/lib/supabase/types";
import { isMapsShareUrlInput } from "@/lib/google/review-url";

/**
 * Gating del pegado manual de deep-links de reseña (§4.54, Capa 3). Mismo
 * público que la bandeja de respuestas: solo admin + reviews_manager pueden
 * poblar/quitar el `google_maps_url` de una reseña a mano. Función pura para
 * defensa en profundidad por encima de la RLS (mig 025 da UPDATE amplio a
 * ambos roles sobre `reviews`). sales / office_director NO.
 */
export function canEditReviewMapsUrl(role: Role | null | undefined): boolean {
  return role === "admin" || role === "reviews_manager";
}

/**
 * URL pegada por el gestor. Acepta el deep-link canónico
 * (`…/maps/reviews/…`) o el enlace corto de "Compartir reseña"
 * (`maps.app.goo.gl/…`), que la server action expande. Rechaza cualquier otra
 * cosa en el borde (sin tocar la red). Tope 2048 por sanidad.
 */
export const setMapsUrlSchema = z.object({
  reviewId: z.string().uuid(),
  url: z
    .string()
    .trim()
    .min(1, "Pega el enlace de la reseña.")
    .max(2048, "El enlace es demasiado largo.")
    .refine(isMapsShareUrlInput, {
      message:
        "Debe ser un enlace de Google Maps: el de 'Compartir reseña' (maps.app.goo.gl/…) o uno que contenga /maps/reviews/.",
    }),
});

export type SetMapsUrlInput = z.input<typeof setMapsUrlSchema>;
