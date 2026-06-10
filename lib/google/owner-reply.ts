import { stripGoogleTranslation } from "@/lib/google/strip-translation";

/**
 * Normaliza la respuesta del PROPIETARIO de una reseña (campo `reviewReply` de
 * la API v4 de Business Profile) al shape que persistimos. Usado por el cron BP
 * tanto al insertar una reseña fresca que ya la trae (caso A) como al sincronizar
 * una respuesta añadida después en Google (caso B) — §4.48.
 *
 * - Aplica `stripGoogleTranslation`: la respuesta también puede traer el bloque
 *   "(Translated by Google)" si el locale de la cuenta difiere (§4.51).
 * - `text` cae a "" si queda vacío tras el strip: el propietario respondió, así
 *   que la reseña debe salir de "Sin responder" igualmente.
 * - `repliedAt` se normaliza a ISO desde el `updateTime` de Google.
 *
 * Devuelve null cuando no hay respuesta (incluye las reseñas de Places, que
 * nunca traen `reviewReply`).
 */
export function normalizeOwnerReply(
  reviewReply: { comment?: string; updateTime: string } | null | undefined,
): { text: string; repliedAt: string } | null {
  if (!reviewReply) return null;
  return {
    text: stripGoogleTranslation(reviewReply.comment ?? null) ?? "",
    repliedAt: new Date(reviewReply.updateTime).toISOString(),
  };
}
