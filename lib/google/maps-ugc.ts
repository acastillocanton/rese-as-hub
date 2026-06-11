/**
 * Helpers PUROS para el enriquecimiento de deep-links de reseña (§4.54).
 *
 * El extractor (scripts/enrich-review-urls.mjs, headless Playwright en CI)
 * obtiene de cada reseña su `data-review-id` (el token que Google pone en el
 * botón "Compartir reseña" del DOM de Maps) y el FID de la ficha. Con esos dos
 * datos se construye el deep-link público a la reseña concreta — SIN clicar
 * "Compartir" en cada una y SIN llamar a ningún endpoint interno.
 *
 * Reverse-engineering verificado E2E (2026-06-11, ficha de Oropesa):
 *   - El `data-review-id` es base64 de un protobuf:  0x0a 0x2f <INNER:47B> 0x10 0x01
 *     (campo1 length-delimited con el token interno + campo2 varint = 1).
 *   - El deep-link de "Compartir" es:
 *       /maps/reviews/data=!4m8!14m7!1m6!2m5!1s{TOKEN}!2m1!1s0x0:0x{CID}!3m1!1s2@1:{INNER}||
 *     donde {TOKEN} = data-review-id, {CID} = 2ª mitad del FID, {INNER} = los
 *     bytes internos del token. Construir esa URL con data-review-id + CID abre
 *     la reseña exacta (probado: reseña de "Lisset Miguel" en Oropesa).
 *
 * Estas funciones se testean en __tests__/maps-ugc.test.ts. El script de CI
 * reimplementa `buildMapsReviewUrl` inline (es .mjs y no puede importar TS con
 * alias sin tooling extra) — mantener ambas en sync; esta es la canónica.
 */

/** Extrae el Feature ID (`0x…:0x…`) del HTML de la página de ficha de Maps.
 *  Devuelve el más frecuente (el de la propia ficha aparece repetido). */
export function extractFidFromHtml(html: string): string | null {
  const matches = html.match(/0x[0-9a-f]{6,}:0x[0-9a-f]{6,}/g);
  if (!matches || matches.length === 0) return null;
  const counts = new Map<string, number>();
  for (const m of matches) counts.set(m, (counts.get(m) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [fid, n] of counts) {
    if (n > bestN) {
      best = fid;
      bestN = n;
    }
  }
  return best;
}

/** CID = segunda mitad del FID (`0x…:0x{CID}`). El deep-link usa `0x0:0x{CID}`. */
export function cidFromFid(fid: string | null | undefined): string | null {
  if (!fid) return null;
  const parts = fid.split(":");
  if (parts.length !== 2) return null;
  const cid = parts[1]!.replace(/^0x/, "");
  return /^[0-9a-f]+$/i.test(cid) ? cid : null;
}

/** Decodifica el INNER (token interno) del `data-review-id`. Tolera base64url.
 *  null si el formato no es el esperado (0x0a 0x2f <len> …). */
export function innerFromReviewToken(reviewToken: string): string | null {
  try {
    const b = Buffer.from(reviewToken, "base64");
    if (b.length < 3 || b[0] !== 0x0a) return null;
    const len = b[1]!;
    if (b.length < 2 + len) return null;
    return b.subarray(2, 2 + len).toString("latin1");
  } catch {
    return null;
  }
}

/**
 * Construye el deep-link público a la reseña concreta en Google Maps.
 * Requiere el `data-review-id` (del DOM) y el FID de la ficha (`0x…:0x…`).
 * Devuelve null si falta algo o el token no decodifica.
 */
export function buildMapsReviewUrl(
  reviewToken: string | null | undefined,
  fid: string | null | undefined,
): string | null {
  if (!reviewToken) return null;
  const cid = cidFromFid(fid);
  if (!cid) return null;
  const inner = innerFromReviewToken(reviewToken);
  if (!inner) return null;
  // %7C%7C = "||". Token y inner son base64url-safe (solo [A-Za-z0-9_-]).
  return (
    "https://www.google.com/maps/reviews/data=" +
    `!4m8!14m7!1m6!2m5!1s${reviewToken}` +
    `!2m1!1s0x0:0x${cid}` +
    `!3m1!1s2@1:${inner}%7C%7C`
  );
}
