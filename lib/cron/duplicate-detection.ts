import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { sameGoogleAuthor } from "@/lib/matching/attribute-review";

/**
 * Helpers de la lógica anti-fraude del marcado de duplicados por `client_id`
 * (migración 015; regla revisada 2026-07-20, §4.61).
 *
 * ⚠️ La deduplicación es por **(mismo cliente + MISMA cuenta de Google)**, NO
 * por cliente a secas. Dos reseñas del mismo cliente/enlace pero de cuentas
 * DISTINTAS (autores distintos) son dos reseñas reales y cuentan las dos
 * (p.ej. una pareja que reseña desde el mismo enlace). Solo se marca duplicada
 * la MISMA cuenta contada dos veces (clon / edición no fusionada). La igualdad
 * de cuenta la decide `sameGoogleAuthor` (transliteración + nameSimilarity;
 * anónimos → misma cuenta = dedupe conservador).
 *
 * Dentro de cada grupo (cliente, cuenta): la principal = la de
 * google_created_at más antiguo; las demás → is_duplicate=true. Las queries de
 * KPIs/Excel filtran `is_duplicate = false` para no contar duplicadas en
 * métricas pagables al comercial.
 *
 * Estos helpers se invocan desde:
 *   - `lib/cron/process-reviews.ts` justo antes del INSERT de cada reseña.
 *   - `app/(profile)/resenas/verificacion/actions.ts` en confirmReview /
 *     reassignReview / rejectReview / claimReview.
 *
 * Toda la lógica usa el service-client (admin) para sortear RLS de reviews
 * y poder mirar el conjunto entero por client_id.
 */

type ServiceClient = ReturnType<typeof createServiceClient>;

type PrincipalRow = {
  id: string;
  google_created_at: string;
  author_name: string | null;
};

export type DuplicateDecision = {
  /** Valor de `is_duplicate` con el que la nueva reseña debe quedar. */
  newIsDuplicate: boolean;
  /** Si no es null, esa reseña vieja debe pasar a is_duplicate=true porque
   *  la nueva es cronológicamente más antigua e invierte la principal. */
  demotedReviewId: string | null;
};

/**
 * Función PURA — decide la marca de duplicado de una reseña entrante dada
 * la lista de principales activas (is_duplicate=false, removed_at IS NULL)
 * que comparten su mismo `client_id`.
 *
 * ⚠️ Solo compite contra las principales de la MISMA cuenta de Google que la
 * entrante (`sameGoogleAuthor`). Las principales de otras cuentas del mismo
 * cliente (p.ej. la pareja) se ignoran → la entrante puede ser su propia
 * principal y contar. Dentro de su cuenta, gana la más antigua.
 *
 * Se separa para tener tests unitarios sin mockear Supabase. La consulta
 * a BD vive en `decideDuplicateForClient`.
 */
export function decideFromPrincipals(
  principals: PrincipalRow[],
  incomingGoogleCreatedAt: string,
  incomingAuthorName: string | null,
): DuplicateDecision {
  // Solo cuentan las principales de la MISMA cuenta.
  const sameAccount = principals.filter((p) =>
    sameGoogleAuthor(p.author_name, incomingAuthorName),
  );
  if (sameAccount.length === 0) {
    return { newIsDuplicate: false, demotedReviewId: null };
  }
  // Aunque en el caso ideal solo hay 1 principal activa por (cliente, cuenta),
  // si hubiera varias (estado inconsistente) comparamos contra la más antigua.
  const oldest = sameAccount.reduce((min, r) =>
    new Date(r.google_created_at).getTime() <
    new Date(min.google_created_at).getTime()
      ? r
      : min,
  );
  const incomingMs = new Date(incomingGoogleCreatedAt).getTime();
  const oldestMs = new Date(oldest.google_created_at).getTime();
  if (incomingMs >= oldestMs) {
    return { newIsDuplicate: true, demotedReviewId: null };
  }
  return { newIsDuplicate: false, demotedReviewId: oldest.id };
}

/**
 * Decide si una reseña que va a insertarse (o reasignarse a un client) debe
 * marcarse duplicada, y si hay que demotar a una principal previa.
 *
 * @param admin service-client
 * @param clientId el client_id de la reseña entrante
 * @param incomingGoogleCreatedAt ISO timestamp de la reseña entrante
 * @param incomingAuthorName nombre del autor (cuenta de Google) de la entrante
 * @param excludeReviewId opcional — id de la reseña entrante si ya existe en
 *        BD (caso `confirmReview` / `reassignReview` que UPDATE-an y no
 *        deben contarse a sí mismas como principal previa).
 */
export async function decideDuplicateForClient(
  admin: ServiceClient,
  args: {
    clientId: string;
    incomingGoogleCreatedAt: string;
    incomingAuthorName: string | null;
    excludeReviewId?: string;
  },
): Promise<DuplicateDecision> {
  let q = admin
    .from("reviews")
    .select("id, google_created_at, author_name")
    .eq("client_id", args.clientId)
    .eq("is_duplicate", false)
    .is("removed_at", null);
  if (args.excludeReviewId) {
    q = q.neq("id", args.excludeReviewId);
  }
  const { data: principals } = await q.returns<PrincipalRow[]>();

  return decideFromPrincipals(
    principals ?? [],
    args.incomingGoogleCreatedAt,
    args.incomingAuthorName,
  );
}

/**
 * Tras un reject/remove sobre una reseña que era principal (is_duplicate=false)
 * con duplicadas activas del mismo client_id, promueve a principal la
 * duplicada cronológicamente más antigua **de la misma cuenta de Google**. Sin
 * esto, las duplicadas de esa cuenta quedarían todas como duplicadas y el
 * comercial no contaría esa reseña.
 *
 * ⚠️ Se acota a la MISMA cuenta que la principal retirada: las duplicadas de
 * otras cuentas del mismo cliente ya son sus propias principales (regla §4.61)
 * y no deben tocarse.
 *
 * @param author nombre del autor de la principal retirada (para acotar la
 *        promoción a su cuenta). Si es null/vacío, se promueve la más antigua
 *        indistinguible (mismo criterio conservador de `sameGoogleAuthor`).
 *
 * Devuelve el id de la que se promocionó (null si no había candidatas).
 */
export async function promoteNextPrincipal(
  admin: ServiceClient,
  clientId: string,
  author: string | null,
): Promise<string | null> {
  const { data: candidates } = await admin
    .from("reviews")
    .select("id, author_name")
    .eq("client_id", clientId)
    .eq("is_duplicate", true)
    .is("removed_at", null)
    .order("google_created_at", { ascending: true })
    .order("fetched_at", { ascending: true })
    .order("id", { ascending: true })
    .returns<{ id: string; author_name: string | null }[]>();

  // La primera (más antigua) que sea de la misma cuenta que la retirada.
  const next = (candidates ?? []).find((c) =>
    sameGoogleAuthor(c.author_name, author),
  );
  if (!next) return null;

  const { error } = await admin
    .from("reviews")
    .update({ is_duplicate: false } as never)
    .eq("id", next.id);
  if (error) {
    console.error("[duplicate-detection] promoteNextPrincipal failed:", error);
    return null;
  }
  return next.id;
}
