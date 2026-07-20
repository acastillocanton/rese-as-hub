"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/audit";
import {
  decideDuplicateForClient,
  promoteNextPrincipal,
} from "@/lib/cron/duplicate-detection";
import type { Role } from "@/lib/supabase/types";
import {
  canPerformAction,
  claimReviewSchema,
  type ClaimReviewInput,
  type VerificationAction,
} from "@/lib/auth/verification-gating";
import { createClientRecord } from "@/app/(sales)/clientes/actions";

const reviewIdSchema = z.string().uuid();

type Actor = {
  userId: string;
  role: Role;
  locationId: string | null;
  /** Comercial multi-oficina (mig 031): reclama huérfanas de cualquier ficha
   *  de escrituración, no solo de su location (que es null). */
  crossLocation: boolean;
};

/**
 * Resuelve el actor autenticado y verifica que su rol puede ejecutar la
 * acción solicitada. Defensa en profundidad por encima de la RLS (mig 016
 * + mig 013).
 *
 *   admin / reviews_manager → todo.
 *   office_director        → todo excepto "claim" (usa reassign con self).
 *   sales                  → solo "claim".
 */
async function getActorForAction(action: VerificationAction): Promise<Actor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("role, location_id, cross_location")
    .eq("id", user.id)
    .maybeSingle<{ role: Role; location_id: string | null; cross_location: boolean }>();
  if (!data) return null;
  if (!canPerformAction(data.role, action)) return null;
  return {
    userId: user.id,
    role: data.role,
    locationId: data.location_id,
    crossLocation: data.cross_location === true,
  };
}

/**
 * True si `clientId` pertenece a `salesId`. La RLS de claim/reassign fuerza
 * el `sales_id` pero NO restringe `client_id`, así que sin esta comprobación
 * un comercial podría atribuir una reseña a un cliente de OTRO comercial
 * (corrompiendo atribución y anti-fraude). Mismo criterio que
 * `linkOrphanReviewToClient` en (sales)/clientes/actions.ts.
 */
async function clientBelongsToSales(clientId: string, salesId: string): Promise<boolean> {
  const adminSrv = createServiceClient();
  const { data } = await adminSrv
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("sales_id", salesId)
    .maybeSingle<{ id: string }>();
  return !!data;
}

/**
 * Verifica que la reseña está dentro del scope del actor:
 *
 *   admin / reviews_manager → siempre.
 *   sales                  → unmatched, no eliminada, de SU location.
 *   office_director        → counted/pending de su equipo o de sí mismo,
 *                            o unmatched de su location.
 *
 * Lookup vía service-client para evitar dependencia de RLS (la fila
 * podría ser unmatched, que el director no ve a través de las policies
 * de mig 013 — sí a través de la nueva policy SELECT de mig 016).
 */
async function assertReviewInScope(
  actor: Actor,
  reviewId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (actor.role === "admin" || actor.role === "reviews_manager") {
    return { ok: true };
  }
  const admin = createServiceClient();
  const { data } = await admin
    .from("reviews")
    .select("location_id, sales_id, removed_at")
    .eq("id", reviewId)
    .maybeSingle<{
      location_id: string;
      sales_id: string | null;
      removed_at: string | null;
    }>();
  if (!data) return { ok: false, error: "Reseña no encontrada." };

  if (actor.role === "sales") {
    if (data.removed_at !== null) {
      return { ok: false, error: "Esta reseña fue eliminada." };
    }
    if (data.sales_id !== null) {
      return { ok: false, error: "Esta reseña ya está atribuida." };
    }
    // Comercial multi-oficina (mig 031/032): puede reclamar huérfanas de
    // CUALQUIER ficha de escrituración (no tiene location_id propia).
    if (actor.crossLocation) {
      const { data: loc } = await admin
        .from("locations")
        .select("id")
        .eq("id", data.location_id)
        .eq("escrituracion_target", true)
        .maybeSingle<{ id: string }>();
      if (!loc) {
        return { ok: false, error: "Esta reseña no es de una de tus oficinas." };
      }
      return { ok: true };
    }
    if (!actor.locationId || data.location_id !== actor.locationId) {
      return { ok: false, error: "Esta reseña no es de tu ficha." };
    }
    return { ok: true };
  }

  if (actor.role === "office_director") {
    if (!actor.locationId) {
      return { ok: false, error: "Director sin oficina asignada." };
    }
    // Unmatched → ok si es de su location.
    if (data.sales_id === null) {
      if (data.location_id !== actor.locationId) {
        return { ok: false, error: "Esa reseña no es de tu oficina." };
      }
      return { ok: true };
    }
    // Atribuida → ok si es self o miembro del equipo.
    if (data.sales_id === actor.userId) return { ok: true };
    const { data: teamMember } = await admin
      .from("profiles")
      .select("id")
      .eq("id", data.sales_id)
      .eq("director_id", actor.userId)
      .maybeSingle<{ id: string }>();
    if (!teamMember) {
      return { ok: false, error: "Esa reseña no es de tu equipo." };
    }
    return { ok: true };
  }

  return { ok: false, error: "No autorizado." };
}

/**
 * Devuelve el cliente con el que ejecutar el UPDATE según el actor.
 * Para office_director usamos service-role porque la RLS está scoped a
 * `sales_id IN team` (mig 013) y no cubre los movimientos sobre unmatched
 * (mig 016 abre SELECT, no UPDATE). El gating en código
 * (canPerformAction + assertReviewInScope) es la autoridad para director.
 *
 * Para sales seguimos con cookie-client: la WITH CHECK de
 * `reviews_sales_claim_update` (mig 016) es la garantía dura de que solo
 * puede dejar la fila con sales_id = auth.uid() y match_state='counted'.
 *
 * Para admin/manager seguimos con cookie-client + RLS amplia.
 */
// Devuelve el cliente Supabase con el que ejecutar el UPDATE según el actor.
// Casteamos el cookie-client al mismo tipo que el service-client para que
// el union type no rompa el `.from(...).update(...)` posterior: las
// versiones recientes de @supabase/supabase-js y @supabase/ssr tipan los
// generics distintos pero el runtime es idéntico.
type Writer = ReturnType<typeof createServiceClient>;

async function writerForActor(actor: Actor): Promise<Writer> {
  if (actor.role === "office_director") return createServiceClient();
  return (await createClient()) as unknown as Writer;
}

async function audit(
  entityId: string,
  action: string,
  payload: Record<string, unknown>,
) {
  // audit_log se escribe vía service-role para que el actor no pueda
  // fabricar entradas a mano. Helper en lib/audit.ts.
  await recordAudit({ entityType: "review", entityId, action, payload });
}

/**
 * Confirma la atribución propuesta por el matcher. Marca match_state='counted'
 * y deja sales_id/client_id como estaban. Usado para reseñas con confianza
 * intermedia donde la propuesta del algoritmo es razonable y el actor la
 * valida sin cambios.
 */
export async function confirmReview(reviewId: string) {
  const parsed = reviewIdSchema.safeParse(reviewId);
  if (!parsed.success) return { ok: false as const, error: "Id inválido." };

  const actor = await getActorForAction("confirm");
  if (!actor) return { ok: false as const, error: "No autorizado." };
  const inScope = await assertReviewInScope(actor, parsed.data);
  if (!inScope.ok) return { ok: false as const, error: inScope.error };

  // Anti-fraude (mig 015): si la reseña confirmada tiene client_id,
  // comprobar si ya hay otra principal del mismo cliente.
  const adminSrv = createServiceClient();
  const { data: current } = await adminSrv
    .from("reviews")
    .select("client_id, google_created_at, is_duplicate, author_name")
    .eq("id", parsed.data)
    .maybeSingle<{
      client_id: string | null;
      google_created_at: string;
      is_duplicate: boolean;
      author_name: string | null;
    }>();

  let dup: { newIsDuplicate: boolean; demotedReviewId: string | null } = {
    newIsDuplicate: current?.is_duplicate ?? false,
    demotedReviewId: null,
  };
  if (current?.client_id) {
    dup = await decideDuplicateForClient(adminSrv, {
      clientId: current.client_id,
      incomingGoogleCreatedAt: current.google_created_at,
      incomingAuthorName: current.author_name,
      excludeReviewId: parsed.data,
    });
  }

  const writer = await writerForActor(actor);
  const { error } = await writer
    .from("reviews")
    .update({
      match_state: "counted",
      is_duplicate: dup.newIsDuplicate,
    } as never)
    .eq("id", parsed.data);
  if (error) {
    console.error("[verificacion] confirmReview failed:", error);
    return { ok: false as const, error: error.message };
  }

  if (dup.demotedReviewId) {
    await adminSrv
      .from("reviews")
      .update({ is_duplicate: true } as never)
      .eq("id", dup.demotedReviewId);
  }

  await audit(parsed.data, "confirm", {
    confirmed_by: actor.userId,
    actor_role: actor.role,
    is_duplicate: dup.newIsDuplicate,
    demoted_review_id: dup.demotedReviewId,
  });
  revalidatePath("/resenas/verificacion");
  return { ok: true as const };
}

/**
 * Rechaza la atribución: limpia sales_id/client_id/share_link_id y marca
 * como 'unmatched'. La reseña permanece en la base pero ya no se
 * contabiliza para ningún comercial.
 */
export async function rejectReview(reviewId: string) {
  const parsed = reviewIdSchema.safeParse(reviewId);
  if (!parsed.success) return { ok: false as const, error: "Id inválido." };

  const actor = await getActorForAction("reject");
  if (!actor) return { ok: false as const, error: "No autorizado." };
  const inScope = await assertReviewInScope(actor, parsed.data);
  if (!inScope.ok) return { ok: false as const, error: inScope.error };

  // Si era PRINCIPAL de un client_id con duplicadas activas, promover la
  // siguiente más antigua tras limpiar la atribución.
  const adminSrv = createServiceClient();
  const { data: current } = await adminSrv
    .from("reviews")
    .select("client_id, is_duplicate, author_name")
    .eq("id", parsed.data)
    .maybeSingle<{
      client_id: string | null;
      is_duplicate: boolean;
      author_name: string | null;
    }>();
  const wasPrincipalOf = current && !current.is_duplicate ? current.client_id : null;

  const writer = await writerForActor(actor);
  const { error } = await writer
    .from("reviews")
    .update({
      match_state: "unmatched",
      sales_id: null,
      client_id: null,
      share_link_id: null,
      is_duplicate: false,
    } as never)
    .eq("id", parsed.data);
  if (error) {
    console.error("[verificacion] rejectReview failed:", error);
    return { ok: false as const, error: error.message };
  }

  let promotedId: string | null = null;
  if (wasPrincipalOf) {
    promotedId = await promoteNextPrincipal(
      adminSrv,
      wasPrincipalOf,
      current?.author_name ?? null,
    );
  }

  await audit(parsed.data, "reject", {
    rejected_by: actor.userId,
    actor_role: actor.role,
    was_principal_of_client: wasPrincipalOf,
    promoted_review_id: promotedId,
  });
  revalidatePath("/resenas/verificacion");
  return { ok: true as const };
}

const reassignSchema = z.object({
  reviewId: z.string().uuid(),
  salesId: z.string().uuid(),
  clientId: z.string().uuid().optional().nullable(),
});

/**
 * Reasigna manualmente la reseña a otro comercial (y opcionalmente otro
 * cliente). Marca como 'counted'.
 */
export async function reassignReview(input: z.input<typeof reassignSchema>) {
  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const actor = await getActorForAction("reassign");
  if (!actor) return { ok: false as const, error: "No autorizado." };
  const inScope = await assertReviewInScope(actor, parsed.data.reviewId);
  if (!inScope.ok) return { ok: false as const, error: inScope.error };

  // Director: el destino debe ser él mismo o un sales de su equipo.
  if (actor.role === "office_director") {
    const adminSrv = createServiceClient();
    const { data: target } = await adminSrv
      .from("profiles")
      .select("role, director_id")
      .eq("id", parsed.data.salesId)
      .maybeSingle<{ role: Role; director_id: string | null }>();
    if (!target) {
      return { ok: false as const, error: "Comercial destino no válido." };
    }
    const isSelf = parsed.data.salesId === actor.userId;
    const isTeamSales = target.role === "sales" && target.director_id === actor.userId;
    if (!isSelf && !isTeamSales) {
      return {
        ok: false as const,
        error: "Solo puedes atribuir reseñas a ti o a tu equipo.",
      };
    }
  }

  // El cliente destino (si se indica) debe pertenecer al comercial destino:
  // evita pares (sales_id, client_id) inconsistentes que alimentarían mal el
  // anti-fraude y el Excel. Aplica a admin/manager/director por igual.
  if (
    parsed.data.clientId &&
    !(await clientBelongsToSales(parsed.data.clientId, parsed.data.salesId))
  ) {
    return {
      ok: false as const,
      error: "El cliente seleccionado no pertenece a ese comercial.",
    };
  }

  // Anti-fraude: si la reseña pasa a tener un client_id que ya tiene
  // principal, marcarla como duplicada. Si la entrante es MÁS antigua,
  // demotamos la principal previa.
  const adminSrv = createServiceClient();
  const { data: current } = await adminSrv
    .from("reviews")
    .select("client_id, google_created_at, is_duplicate, author_name")
    .eq("id", parsed.data.reviewId)
    .maybeSingle<{
      client_id: string | null;
      google_created_at: string;
      is_duplicate: boolean;
      author_name: string | null;
    }>();
  const previousClientId = current?.client_id ?? null;
  const wasPrincipalOf =
    current && !current.is_duplicate ? previousClientId : null;

  let dup: { newIsDuplicate: boolean; demotedReviewId: string | null } = {
    newIsDuplicate: false,
    demotedReviewId: null,
  };
  const newClientId = parsed.data.clientId ?? null;
  if (newClientId && current) {
    dup = await decideDuplicateForClient(adminSrv, {
      clientId: newClientId,
      incomingGoogleCreatedAt: current.google_created_at,
      incomingAuthorName: current.author_name,
      excludeReviewId: parsed.data.reviewId,
    });
  }

  const writer = await writerForActor(actor);
  const { error } = await writer
    .from("reviews")
    .update({
      match_state: "counted",
      sales_id: parsed.data.salesId,
      client_id: newClientId,
      is_duplicate: dup.newIsDuplicate,
    } as never)
    .eq("id", parsed.data.reviewId);
  if (error) {
    console.error("[verificacion] reassignReview failed:", error);
    return { ok: false as const, error: error.message };
  }

  if (dup.demotedReviewId) {
    await adminSrv
      .from("reviews")
      .update({ is_duplicate: true } as never)
      .eq("id", dup.demotedReviewId);
  }

  let promotedOrphanId: string | null = null;
  if (wasPrincipalOf && wasPrincipalOf !== newClientId) {
    promotedOrphanId = await promoteNextPrincipal(
      adminSrv,
      wasPrincipalOf,
      current?.author_name ?? null,
    );
  }

  await audit(parsed.data.reviewId, "reassign", {
    reassigned_by: actor.userId,
    actor_role: actor.role,
    new_sales_id: parsed.data.salesId,
    new_client_id: newClientId,
    previous_client_id: previousClientId,
    is_duplicate: dup.newIsDuplicate,
    demoted_review_id: dup.demotedReviewId,
    promoted_orphan_review_id: promotedOrphanId,
  });
  revalidatePath("/resenas/verificacion");
  return { ok: true as const };
}

/**
 * "Reclamar" — acción específica del rol sales. Toma una reseña unmatched
 * de su location y la atribuye a sí mismo, opcionalmente con un client_id
 * existente o creando un cliente nuevo inline.
 *
 * Garantías:
 *   • Schema XOR: clientId o newClientName, no ambos.
 *   • RLS WITH CHECK (`reviews_sales_claim_update`, mig 016) fuerza que
 *     la fila resultante quede con sales_id = auth.uid() y
 *     match_state='counted'. Imposible reasignar a otro o desatribuir
 *     vía esta acción.
 *   • Doble candado `.is("sales_id", null).is("removed_at", null)` en el
 *     WHERE: si otro sales se adelantó, el UPDATE matchea 0 filas y
 *     devolvemos error UX claro.
 *   • Anti-fraude (mig 015): si el cliente ya tiene principal, la nueva
 *     entra como duplicada.
 */
export async function claimReview(input: ClaimReviewInput) {
  const parsed = claimReviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const actor = await getActorForAction("claim");
  if (!actor) return { ok: false as const, error: "No autorizado." };
  const inScope = await assertReviewInScope(actor, parsed.data.reviewId);
  if (!inScope.ok) return { ok: false as const, error: inScope.error };

  // Un clientId existente debe ser del propio comercial. La rama de cliente
  // nuevo (newClientName) es segura: createClientRecord fuerza sales_id = self.
  if (
    parsed.data.clientId &&
    !(await clientBelongsToSales(parsed.data.clientId, actor.userId))
  ) {
    return { ok: false as const, error: "Ese cliente no es tuyo." };
  }

  // Necesitamos la ficha de la reseña ANTES de crear el cliente: para un
  // comercial multi-oficina (mig 031) el cliente nuevo debe nacer en la MISMA
  // ficha de la reseña reclamada (createClientRecord exige locationId).
  const adminSrv = createServiceClient();
  const { data: current } = await adminSrv
    .from("reviews")
    .select("google_created_at, location_id, author_name")
    .eq("id", parsed.data.reviewId)
    .maybeSingle<{
      google_created_at: string;
      location_id: string;
      author_name: string | null;
    }>();
  if (!current) {
    return { ok: false as const, error: "Reseña no encontrada." };
  }

  // Resolver el cliente: existente, nuevo o ninguno.
  let clientId: string | null = parsed.data.clientId;
  let wasNewClient = false;
  if (parsed.data.newClientName) {
    const created = await createClientRecord({
      fullName: parsed.data.newClientName,
      phone: null,
      email: null,
      // Multi-oficina: el cliente hereda la ficha de la reseña reclamada.
      ...(actor.crossLocation ? { locationId: current.location_id } : {}),
    });
    if (!created.ok) {
      return { ok: false as const, error: created.error };
    }
    clientId = created.client.id;
    wasNewClient = true;
  }

  let dup: { newIsDuplicate: boolean; demotedReviewId: string | null } = {
    newIsDuplicate: false,
    demotedReviewId: null,
  };
  if (clientId) {
    dup = await decideDuplicateForClient(adminSrv, {
      clientId,
      incomingGoogleCreatedAt: current.google_created_at,
      incomingAuthorName: current.author_name,
      excludeReviewId: parsed.data.reviewId,
    });
  }

  // UPDATE con cookie-client. RLS `reviews_sales_claim_update` con WITH
  // CHECK estricta + WHERE explícito sobre sales_id IS NULL bloquea race
  // conditions y abusos.
  const supabase = await createClient();
  const { error, data: updated } = await supabase
    .from("reviews")
    .update({
      match_state: "counted",
      sales_id: actor.userId,
      client_id: clientId,
      is_duplicate: dup.newIsDuplicate,
    } as never)
    .eq("id", parsed.data.reviewId)
    .is("sales_id", null)
    .is("removed_at", null)
    .select("id");
  if (error) {
    console.error("[verificacion] claimReview failed:", error);
    return { ok: false as const, error: error.message };
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false as const,
      error: "Otro comercial se adelantó o la reseña ya no está disponible.",
    };
  }

  if (dup.demotedReviewId) {
    await adminSrv
      .from("reviews")
      .update({ is_duplicate: true } as never)
      .eq("id", dup.demotedReviewId);
  }

  await audit(parsed.data.reviewId, "claim", {
    claimed_by: actor.userId,
    client_id: clientId,
    was_new_client: wasNewClient,
    is_duplicate: dup.newIsDuplicate,
    demoted_review_id: dup.demotedReviewId,
  });
  revalidatePath("/resenas/verificacion");
  revalidatePath("/panel/resenas");
  revalidatePath("/panel");
  revalidatePath("/dashboard");
  revalidatePath("/clientes");
  revalidatePath("/ranking");
  // Exponemos `clientId` y `wasNewClient` para que la UI pueda lanzar el
  // modal de sugerencias (OrphanReviewsModal) cuando el sales creó cliente
  // inline durante la reclamación. Si NO se creó cliente nuevo, el caller
  // ignora estos campos.
  return {
    ok: true as const,
    clientId,
    wasNewClient,
  };
}

/**
 * Marca una reseña como eliminada en Google (soft delete). admin,
 * reviews_manager o office_director (dentro de su scope).
 */
export async function markReviewRemoved(reviewId: string) {
  const parsed = reviewIdSchema.safeParse(reviewId);
  if (!parsed.success) return { ok: false as const, error: "Id inválido." };

  const actor = await getActorForAction("mark_removed");
  if (!actor) return { ok: false as const, error: "No autorizado." };
  const inScope = await assertReviewInScope(actor, parsed.data);
  if (!inScope.ok) return { ok: false as const, error: inScope.error };

  const writer = await writerForActor(actor);
  const { error } = await writer
    .from("reviews")
    .update({ removed_at: new Date().toISOString() } as never)
    .eq("id", parsed.data)
    .is("removed_at", null);
  if (error) {
    console.error("[verificacion] markReviewRemoved failed:", error);
    return { ok: false as const, error: error.message };
  }

  await audit(parsed.data, "mark_removed", {
    removed_by: actor.userId,
    actor_role: actor.role,
    source: "manual",
  });
  revalidatePath("/resenas/verificacion");
  revalidatePath("/manager/resenas");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/**
 * Restaura una reseña que estaba marcada como eliminada.
 */
export async function restoreReview(reviewId: string) {
  const parsed = reviewIdSchema.safeParse(reviewId);
  if (!parsed.success) return { ok: false as const, error: "Id inválido." };

  const actor = await getActorForAction("restore");
  if (!actor) return { ok: false as const, error: "No autorizado." };
  const inScope = await assertReviewInScope(actor, parsed.data);
  if (!inScope.ok) return { ok: false as const, error: inScope.error };

  const writer = await writerForActor(actor);
  // missing_since también se limpia (mig 028): si la reseña fue auto-removed
  // por el reconcile del cron BP (§4.20), restaurar sin limpiar el sello haría
  // que el siguiente run la re-marcara al instante (ausencia "sostenida" vieja).
  // Así la restauración manual gana un periodo de gracia fresco de 24h.
  const { error } = await writer
    .from("reviews")
    .update({ removed_at: null, missing_since: null } as never)
    .eq("id", parsed.data)
    .not("removed_at", "is", null);
  if (error) {
    console.error("[verificacion] restoreReview failed:", error);
    return { ok: false as const, error: error.message };
  }

  await audit(parsed.data, "restore", {
    restored_by: actor.userId,
    actor_role: actor.role,
    source: "manual",
  });
  revalidatePath("/resenas/verificacion");
  revalidatePath("/manager/resenas");
  revalidatePath("/dashboard");
  return { ok: true as const };
}
