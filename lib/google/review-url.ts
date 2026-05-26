/**
 * Devuelve la URL pública de Google con el panel de reseñas de la ficha
 * (place_id) desplegado. Si no hay place_id, devuelve null y el caller
 * debe omitir el render del enlace.
 *
 * Pre-condicionado: cuando llegue cuota de Google Business Profile API y
 * las reseñas lleguen con `reviewId` raw (no el sintético `places:...`
 * de Places API — ver §4.17 del CLAUDE.md), extender este helper a un
 * deep-link de la reseña concreta combinando place_id + reviewId. La
 * firma quedará algo como `buildGoogleReviewUrl(placeId, googleReviewId,
 * source)` y switcheará entre URL a la lista (Places) y URL a la reseña
 * concreta (Business Profile).
 *
 * NO confundir con `buildGoogleReviewUrl` de [lib/landing.ts](lib/landing.ts),
 * que construye la URL pública de Google para ESCRIBIR una reseña
 * (`/local/writereview`). Aquí construimos la URL para VERLA
 * (`/local/reviews`).
 */
export function buildGoogleReviewListUrl(
  placeId: string | null | undefined,
): string | null {
  if (!placeId) return null;
  return `https://search.google.com/local/reviews?placeid=${encodeURIComponent(placeId)}`;
}
