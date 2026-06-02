import { nameSimilarity } from "@/lib/matching/attribute-review";

/**
 * Sugerencia de vinculación de reseñas "huérfanas" (counted al sales
 * pero sin client_id) a un cliente recién creado.
 *
 * Caso típico: el cliente deja la reseña ANTES de que el comercial lo
 * dé de alta en su CRM. Por orden temporal el matcher la dejó como
 * unmatched (no había share_link), un humano luego la reclamó al sales
 * sin asignar cliente. Cuando se crea el cliente posteriormente,
 * deberíamos detectarlo y sugerir el vínculo.
 *
 * Función pura — sin I/O. El caller (server action) hace la query a
 * Supabase y le pasa la lista cruda; aquí solo scoreamos por similitud
 * de nombre.
 */

export type OrphanReviewCandidate = {
  id: string;
  author_name: string;
  rating: number;
  google_created_at: string;
  similarity: number;
};

/**
 * Umbral de score (0-100) por encima del cual una reseña se considera
 * "muy probablemente del cliente" y se sugiere al usuario para vincular.
 *
 * Más conservador que `PENDING_THRESHOLD = 40` del matcher automático
 * porque aquí ya hay un humano confirmando uno a uno — preferimos
 * mostrarle pocas candidatas de alta confianza que muchas falsas.
 */
export const ORPHAN_SUGGEST_THRESHOLD = 50;

/**
 * Umbral de score (0-100) por encima del cual una reseña huérfana se considera
 * casi-segura del cliente y se **vincula en automático** al crear el cliente,
 * sin pedir confirmación humana. Las candidatas entre `ORPHAN_SUGGEST_THRESHOLD`
 * y este valor (50-89) siguen mostrándose en el modal para que el humano decida.
 *
 * 90 = todos los tokens del nombre del cliente aparecen en el autor (p.ej.
 * cliente "Alba Aicart" vs autor "Alba Aicart" → 100; cliente "Salvador
 * Sanchis" vs autor "Salvador Sanchis Plaus" → 90). Casos como "S. Sanchis"
 * (30) o "Salvador López" (55, solo nombre de pila) NO se auto-vinculan.
 */
export const ORPHAN_AUTOLINK_THRESHOLD = 90;

/** Máximo de candidatas mostradas en el modal. */
const MAX_CANDIDATES = 5;

export type OrphanReviewInput = {
  id: string;
  author_name: string;
  rating: number;
  google_created_at: string;
};

/**
 * Calcula la similitud del autor de cada reseña con el nombre del
 * cliente, filtra las que superan `ORPHAN_SUGGEST_THRESHOLD`, las
 * ordena por similarity desc y limita a top `MAX_CANDIDATES`.
 *
 * En caso de empate, ordena por `google_created_at` desc (más reciente
 * primero) para que el usuario vea las novedades arriba.
 */
export function scoreOrphanCandidates(
  clientName: string,
  reviews: OrphanReviewInput[],
  limit: number = MAX_CANDIDATES,
): OrphanReviewCandidate[] {
  if (!clientName || reviews.length === 0) return [];
  const scored: OrphanReviewCandidate[] = [];
  for (const r of reviews) {
    const similarity = nameSimilarity(clientName, r.author_name);
    if (similarity >= ORPHAN_SUGGEST_THRESHOLD) {
      scored.push({
        id: r.id,
        author_name: r.author_name,
        rating: r.rating,
        google_created_at: r.google_created_at,
        similarity,
      });
    }
  }
  scored.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    return b.google_created_at.localeCompare(a.google_created_at);
  });
  return scored.slice(0, limit);
}

/**
 * Divide candidatas ya scoreadas en:
 *   - `autoLink`: similarity >= ORPHAN_AUTOLINK_THRESHOLD (casi-exactas) → se
 *     vinculan solas, sin clic humano.
 *   - `suggest`: el resto (50-89) → se muestran en el modal para confirmar.
 * Función pura — el caller hace las escrituras.
 */
export function partitionOrphanCandidates(candidates: OrphanReviewCandidate[]): {
  autoLink: OrphanReviewCandidate[];
  suggest: OrphanReviewCandidate[];
} {
  const autoLink: OrphanReviewCandidate[] = [];
  const suggest: OrphanReviewCandidate[] = [];
  for (const c of candidates) {
    if (c.similarity >= ORPHAN_AUTOLINK_THRESHOLD) autoLink.push(c);
    else suggest.push(c);
  }
  return { autoLink, suggest };
}
