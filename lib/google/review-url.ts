/**
 * Devuelve la URL de Google Maps para la ficha del establecimiento
 * identificado por `placeId`. Google Maps abre la ficha en el panel
 * lateral con sus reseñas accesibles (un scroll/tap). Si no hay
 * place_id, devuelve null y el caller debe omitir el render del enlace.
 *
 * Usamos el patrón canónico `maps/place/?q=place_id:XXX` (documentado
 * en https://developers.google.com/maps/documentation/urls/get-started)
 * porque:
 *   • Abre la ficha en el contexto familiar de Google Maps (panel
 *     lateral con foto, reseñas, info, etc.).
 *   • Es más útil para el usuario que el endpoint `search.google.com/
 *     local/reviews?placeid=...` (lista de reseñas en formato search
 *     results, menos rica).
 *   • Resuelve directamente sin redirects.
 *
 * Pre-condicionado: cuando llegue cuota de Google Business Profile API
 * y las reseñas lleguen con `reviewId` raw (no el sintético `places:...`
 * de Places API — ver §4.17 del CLAUDE.md), extender este helper a un
 * deep-link de la reseña concreta combinando place_id + reviewId.
 *
 * NO confundir con `buildGoogleReviewUrl` de [lib/landing.ts](lib/landing.ts),
 * que construye la URL pública de Google para ESCRIBIR una reseña
 * (`/local/writereview`). Aquí construimos la URL para VERLA en Maps.
 */
export function buildGoogleReviewListUrl(
  placeId: string | null | undefined,
): string | null {
  if (!placeId) return null;
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}
