/**
 * Devuelve la URL pública de Google que abre **directamente el panel de
 * reseñas** de la ficha identificada por `placeId`. Si no hay place_id,
 * devuelve null y el caller debe omitir el render del enlace.
 *
 * Endpoint: `https://search.google.com/local/reviews?placeid=XXX`.
 *
 * ⚠️ Lectura obligada antes de tocar esto:
 *
 * Probamos también `https://www.google.com/maps/place/?q=place_id:XXX`
 * (el formato canónico documentado por Google: https://developers.google
 * .com/maps/documentation/urls/get-started). Pero ese URL abre la ficha
 * en Maps **sin la pestaña de reseñas activa** — el usuario tiene que
 * pulsar "Reseñas" en el panel lateral.
 *
 * El URL "ideal" (Maps con pestaña reseñas ya abierta) requiere el
 * formato propietario `/maps/place/NAME/@LAT,LNG/data=...!9m1!1b1...`
 * donde `!9m1!1b1` es el flag interno de "open reviews tab". Ese URL
 * usa el **FID interno de Google** (formato `0xd4229bf2610dbbb:
 * 0x82cd3c43f9e0c854`), NO el `place_id` estándar (formato `ChIJ...`)
 * que guardamos en `locations.google_place_id`. No es API público, es
 * un hash propietario de Maps, no construible desde el place_id.
 *
 * Por eso volvemos al endpoint `search.google.com/local/reviews` que
 * abre directamente el panel de reseñas ordenadas, aunque sea en
 * formato Google Search (no en Maps): el usuario llega de un click a
 * las reseñas, que es lo que pidió.
 *
 * Pre-condicionado: cuando llegue cuota de Google Business Profile API
 * y las reseñas lleguen con `reviewId` raw (no el sintético `places:...`
 * de Places API — ver §4.17 del CLAUDE.md), extender este helper a un
 * deep-link de la reseña concreta combinando place_id + reviewId.
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
