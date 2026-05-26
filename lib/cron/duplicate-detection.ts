import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * Helpers de la lógica anti-fraude del marcado de duplicados por `client_id`
 * (migración 015). La principal por cada cliente = la de google_created_at
 * más antiguo. Las demás → is_duplicate=true. Las queries de KPIs/Excel
 * filtran `is_duplicate = false` para no contar duplicadas en métricas
 * pagables al comercial.
 *
 * Estos helpers se invocan desde:
 *   - `lib/cron/process-reviews.ts` justo antes del INSERT de cada reseña.
 *   - `app/(admin)/resenas/verificacion/actions.ts` en confirmReview /
 *     reassignReview / rejectReview.
 *
 * Toda la lógica usa el service-client (admin) para sortear RLS de reviews
 * y poder mirar el conjunto entero por client_id.
 */

type ServiceClient = ReturnType<typeof createServiceClient>;

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
 * Se separa para tener tests unitarios sin mockear Supabase. La consulta
 * a BD vive en `decideDuplicateForClient`.
 */
export function decideFromPrincipals(
  principals: { id: string; google_created_at: string }[],
  incomingGoogleCreatedAt: string,
): DuplicateDecision {
  if (principals.length === 0) {
    return { newIsDuplicate: false, demotedReviewId: null };
  }
  // Aunque en el caso ideal solo hay 1 principal activa por client_id, si
  // hubiera varias (estado inconsistente) comparamos contra la más antigua.
  const oldest = principals.reduce((min, r) =>
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
 * @param excludeReviewId opcional — id de la reseña entrante si ya existe en
 *        BD (caso `confirmReview` / `reassignReview` que UPDATE-an y no
 *        deben contarse a sí mismas como principal previa).
 */
export async function decideDuplicateForClient(
  admin: ServiceClient,
  args: {
    clientId: string;
    incomingGoogleCreatedAt: string;
    excludeReviewId?: string;
  },
): Promise<DuplicateDecision> {
  let q = admin
    .from("reviews")
    .select("id, google_created_at")
    .eq("client_id", args.clientId)
    .eq("is_duplicate", false)
    .is("removed_at", null);
  if (args.excludeReviewId) {
    q = q.neq("id", args.excludeReviewId);
  }
  const { data: principals } = await q.returns<
    { id: string; google_created_at: string }[]
  >();

  return decideFromPrincipals(principals ?? [], args.incomingGoogleCreatedAt);
}

/**
 * Tras un reject/remove sobre una reseña que era principal (is_duplicate=false)
 * con duplicadas activas del mismo client_id, promueve a principal la
 * duplicada cronológicamente más antigua. Sin esto, todas quedarían como
 * duplicadas y el comercial no contaría ninguna.
 *
 * Devuelve el id de la que se promocionó (null si no había candidatas).
 */
export async function promoteNextPrincipal(
  admin: ServiceClient,
  clientId: string,
): Promise<string | null> {
  const { data: candidates } = await admin
    .from("reviews")
    .select("id")
    .eq("client_id", clientId)
    .eq("is_duplicate", true)
    .is("removed_at", null)
    .order("google_created_at", { ascending: true })
    .order("fetched_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .returns<{ id: string }[]>();

  const next = candidates?.[0];
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
