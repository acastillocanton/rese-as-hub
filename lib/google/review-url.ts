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
 * Deep-link a la reseña concreta (§4.54): la Business Profile API NO expone
 * URL por reseña, pero el enlace de "Compartir reseña" de Google Maps sí
 * (`/maps/reviews/data=…`). Lo obtenemos automáticamente por otra vía
 * (ver lib/google/maps-ugc.ts) y lo guardamos en `reviews.google_maps_url`.
 * Para el render se usa `buildGoogleReviewUrl` (abajo), que cae a la lista
 * cuando aún no hay deep-link.
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

/**
 * URL para VER una reseña en Google, con degradación transparente:
 *   - Si la reseña tiene `google_maps_url` (deep-link a la reseña concreta,
 *     obtenido por el enriquecimiento de §4.54) → se devuelve ese.
 *   - Si no (aún sin enriquecer, o el match no fue concluyente) → se cae al
 *     enlace de la LISTA de reseñas de la ficha (`buildGoogleReviewListUrl`).
 *   - Si no hay ni deep-link ni place_id → null (el caller omite el enlace).
 *
 * Esta es la función que deben usar todos los call sites de `<GoogleReviewLink>`
 * (las 5 pantallas de listados + Excel + email de alerta). El deep-link va
 * rellenándose en segundo plano; mientras tanto el usuario sigue llegando a
 * la lista, así que activar el enriquecimiento no produce regresión.
 */
export function buildGoogleReviewUrl(args: {
  mapsUrl?: string | null;
  placeId?: string | null;
}): string | null {
  const mapsUrl = args.mapsUrl?.trim();
  if (mapsUrl) return mapsUrl;
  return buildGoogleReviewListUrl(args.placeId);
}

/** True si la URL es un deep-link a la reseña concreta (no el de lista). */
export function isDeepReviewUrl(url: string | null | undefined): boolean {
  return !!url && url.includes("/maps/reviews/");
}

/**
 * True si la URL es un enlace CORTO de compartir de Google Maps
 * (`maps.app.goo.gl/…` o `goo.gl/maps/…`). Estos enlazan a una reseña/sitio y
 * hay que **expandirlos** (seguir el redirect) para obtener la URL canónica.
 * El whitelisting de host es además la guarda anti-SSRF del expandidor:
 * `setReviewMapsUrl` solo hace fetch a estos dominios.
 */
export function isMapsShortShareUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https:\/\/(maps\.app\.goo\.gl|goo\.gl)\//i.test(url.trim());
}

/**
 * True si el texto pegado es un input ACEPTABLE para el deep-link manual
 * (§4.54, Capa 3): o ya es un deep-link `/maps/reviews/…`, o es un enlace
 * corto de compartir que expandiremos. Cualquier otra cosa se rechaza en el
 * borde sin tocar la red.
 */
export function isMapsShareUrlInput(url: string | null | undefined): boolean {
  return isDeepReviewUrl(url) || isMapsShortShareUrl(url);
}
