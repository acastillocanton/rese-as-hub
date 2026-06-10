/**
 * La API v4 de Google Business Profile devuelve el `comment` de una reseña con
 * una traducción automática INCRUSTADA cuando el idioma de la reseña no coincide
 * con el locale de la cuenta de Google. El formato observado en producción
 * (2026-06-10) es, de forma consistente:
 *
 *   <texto original del cliente>
 *
 *   (Translated by Google)
 *   <traducción automática>
 *
 * Google también puede invertir el orden (traducción primero, original tras un
 * marcador `(Original)`), aunque hoy no se da ningún caso así en BD. Cubrimos
 * ambos para ser robustos.
 *
 * Decisión de producto (§4.51): guardamos SOLO el texto original tal cual lo
 * escribió el cliente — la traducción de Google es ruido en la plataforma.
 *
 * Seguro para el matcher (§4.38): el original siempre conserva la mención al
 * comercial (los nombres propios no se traducen: "Katalin", "Joan"…), así que
 * quitar la traducción no afecta a la atribución.
 *
 * Los marcadores `(Translated by Google)` / `(Original)` SIEMPRE vienen en
 * inglés, independientemente del idioma de la reseña o de la cuenta.
 */
const TRANSLATED_MARKER = "(Translated by Google)";
const ORIGINAL_MARKER = "(Original)";

export function stripGoogleTranslation(
  comment: string | null | undefined,
): string | null {
  if (comment == null) return null;

  const translatedIdx = comment.indexOf(TRANSLATED_MARKER);
  if (translatedIdx === -1) return comment; // sin traducción incrustada → tal cual

  // Formato A (observado): "<original>\n\n(Translated by Google)\n<traducción>"
  // → el original es todo lo que va ANTES del marcador.
  const before = comment.slice(0, translatedIdx).trim();
  if (before.length > 0) return before;

  // Formato B (Google a veces invierte): el comment EMPIEZA por el marcador de
  // traducción y el original vive tras "(Original)".
  const originalIdx = comment.indexOf(ORIGINAL_MARKER);
  if (originalIdx !== -1) {
    const after = comment.slice(originalIdx + ORIGINAL_MARKER.length).trim();
    if (after.length > 0) return after;
  }

  // No se pudo aislar el original limpiamente → devolvemos el texto íntegro
  // (mejor dejar algo que perderlo).
  return comment.trim();
}
