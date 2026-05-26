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

const reviewIdSchema = z.string().uuid();

type Actor = { userId: string; role: Role; locationId: string | null };

/**
 * Para acciones de matching (confirmar, rechazar, reasignar): admin global o
 * office_director (este último limitado por scope a su location).
 */
async function getMatchingActor(): Promise<Actor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("role, location_id")
    .eq("id", user.id)
    .maybeSingle<{ role: Role; location_id: string | null }>();
  if (!data) return null;
  if (data.role === "admin" || data.role === "office_director") {
    return { userId: user.id, role: data.role, locationId: data.location_id };
  }
  return null;
}

/**
 * Para acciones operativas (marcar eliminada, restaurar) admitimos también
 * al gestor de reseñas. Estas acciones no afectan a matching ni a stats
 * permanentes; solo soft-delete + soft-restore con audit trail.
 */
async function getRemovalActor(): Promise<Actor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("role, location_id")
    .eq("id", user.id)
    .maybeSingle<{ role: Role; location_id: string | null }>();
  if (!data) return null;
  if (
    data.role === "admin" ||
    data.role === "reviews_manager" ||
    data.role === "office_director"
  ) {
    return { userId: user.id, role: data.role, locationId: data.location_id };
  }
  return null;
}

/**
 * Para office_director: verifica que la reseña pertenece a su ficha.
 * Lookup vía service-client para evitar problemas con RLS si la policy
 * todavía no ve la reseña por algún edge case.
 */
async function assertReviewInScope(
  actor: Actor,
  reviewId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (actor.role !== "office_director") return { ok: true };
  if (!actor.locationId) {
    return { ok: false, error: "Director sin oficina asignada." };
  }
  const admin = createServiceClient();
  const { data } = await admin
    .from("reviews")
    .select("location_id")
    .eq("id", reviewId)
    .maybeSingle<{ location_id: string }>();
  if (!data) return { ok: false, error: "Reseña no encontrada." };
  if (data.location_id !== actor.locationId) {
    return { ok: false, error: "Esa reseña no es de tu oficina." };
  }
  return { ok: true };
}

async function audit(
  entityId: string,
  action: string,
  payload: Record<string, unknown>,
) {
  // audit_log tiene RLS habilitado sin política de INSERT para ningún rol:
  // se escribe vía service-role para que el comercial/admin no pueda fabricar
  // entradas a mano. Helper en lib/audit.ts.
  await recordAudit({ entityType: "review", entityId, action, payload });
}

/**
 * Confirma la atribución propuesta por el matcher. Marca match_state='counted'
 * y deja sales_id/client_id como estaban. Usado para reseñas con confianza
 * entre 40-75 donde la propuesta del algoritmo es razonable y el admin la
 * valida sin cambios.
 */
export async function confirmReview(reviewId: string) {
  const parsed = reviewIdSchema.safeParse(reviewId);
  if (!parsed.success) return { ok: false as const, error: "Id inválido." };

  const actor = await getMatchingActor();
  if (!actor) return { ok: false as const, error: "No autorizado." };
  const inScope = await assertReviewInScope(actor, parsed.data);
  if (!inScope.ok) return { ok: false as const, error: inScope.error };

  // Si la reseña confirmada tiene client_id, aplicar la regla anti-fraude
  // (migración 015): comprobar si ya hay otra principal del mismo cliente.
  const adminSrv = createServiceClient();
  const { data: current } = await adminSrv
    .from("reviews")
    .select("client_id, google_created_at, is_duplicate")
    .eq("id", parsed.data)
    .maybeSingle<{
      client_id: string | null;
      google_created_at: string;
      is_duplicate: boolean;
    }>();

  let dup: { newIsDuplicate: boolean; demotedReviewId: string | null } = {
    newIsDuplicate: current?.is_duplicate ?? false,
    demotedReviewId: null,
  };
  if (current?.client_id) {
    dup = await decideDuplicateForClient(adminSrv, {
      clientId: current.client_id,
      incomingGoogleCreatedAt: current.google_created_at,
      excludeReviewId: parsed.data,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase
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
 * Rechaza la atribución: limpia sales_id/client_id/share_link_id y marca como
 * 'unmatched'. La reseña permanece en la base (sigue siendo una reseña real
 * de Google) pero ya no se contabiliza para ningún comercial.
 */
export async function rejectReview(reviewId: string) {
  const parsed = reviewIdSchema.safeParse(reviewId);
  if (!parsed.success) return { ok: false as const, error: "Id inválido." };

  const actor = await getMatchingActor();
  if (!actor) return { ok: false as const, error: "No autorizado." };
  const inScope = await assertReviewInScope(actor, parsed.data);
  if (!inScope.ok) return { ok: false as const, error: inScope.error };

  // Si la reseña a rechazar era PRINCIPAL de un client_id que tiene
  // duplicadas activas, debemos promover la siguiente más antigua tras
  // limpiar la atribución para que no queden todas como duplicadas.
  const adminSrv = createServiceClient();
  const { data: current } = await adminSrv
    .from("reviews")
    .select("client_id, is_duplicate")
    .eq("id", parsed.data)
    .maybeSingle<{ client_id: string | null; is_duplicate: boolean }>();
  const wasPrincipalOf = current && !current.is_duplicate ? current.client_id : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({
      match_state: "unmatched",
      sales_id: null,
      client_id: null,
      share_link_id: null,
      // Al desatribuir, ya no tiene cliente, no aplica la marca duplicada.
      is_duplicate: false,
    } as never)
    .eq("id", parsed.data);
  if (error) {
    console.error("[verificacion] rejectReview failed:", error);
    return { ok: false as const, error: error.message };
  }

  let promotedId: string | null = null;
  if (wasPrincipalOf) {
    promotedId = await promoteNextPrincipal(adminSrv, wasPrincipalOf);
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
 * cliente). Marca como 'counted'. Usado cuando el matcher acertó en parte
 * o cuando el admin sabe a quién corresponde porque tiene contexto que el
 * algoritmo no puede tener.
 */
export async function reassignReview(input: z.input<typeof reassignSchema>) {
  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const actor = await getMatchingActor();
  if (!actor) return { ok: false as const, error: "No autorizado." };
  const inScope = await assertReviewInScope(actor, parsed.data.reviewId);
  if (!inScope.ok) return { ok: false as const, error: inScope.error };
  // Director: el destino debe ser él mismo (auto-asignación productor) o un
  // sales de su equipo (director_id = actor.userId). Migración 013 cambió el
  // scope del director de location_id a director_id; aquí validamos eso.
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
      return { ok: false as const, error: "Solo puedes atribuir reseñas a ti o a tu equipo." };
    }
  }

  // Anti-fraude: si la reseña pasa a tener un client_id que ya tiene
  // principal, marcarla como duplicada. Si la entrante es MÁS antigua,
  // demotamos la principal previa.
  const adminSrv = createServiceClient();
  const { data: current } = await adminSrv
    .from("reviews")
    .select("client_id, google_created_at, is_duplicate")
    .eq("id", parsed.data.reviewId)
    .maybeSingle<{
      client_id: string | null;
      google_created_at: string;
      is_duplicate: boolean;
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
      excludeReviewId: parsed.data.reviewId,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase
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

  // Si la reasignación dejó "huérfano" a un client_id que perdía su principal
  // (porque el reviewId movió a otro cliente o se quedó sin cliente), promover
  // la siguiente duplicada activa para que el comercial original no pierda la
  // cuenta arbitrariamente.
  let promotedOrphanId: string | null = null;
  if (
    wasPrincipalOf &&
    wasPrincipalOf !== newClientId
  ) {
    promotedOrphanId = await promoteNextPrincipal(adminSrv, wasPrincipalOf);
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
 * Marca una reseña como eliminada en Google (soft delete). Usado para
 * casos que el cron de Places API no puede detectar automáticamente
 * (reseñas antiguas fuera del top-5, modificaciones que Google reordena
 * etc.). Admin y reviews_manager.
 *
 * No tocamos sales_id/client_id ni match_state — si Google la vuelve a
 * mostrar y la restauramos, el matching propuesto sigue ahí.
 */
export async function markReviewRemoved(reviewId: string) {
  const parsed = reviewIdSchema.safeParse(reviewId);
  if (!parsed.success) return { ok: false as const, error: "Id inválido." };

  const actor = await getRemovalActor();
  if (!actor) return { ok: false as const, error: "No autorizado." };
  const inScope = await assertReviewInScope(actor, parsed.data);
  if (!inScope.ok) return { ok: false as const, error: inScope.error };

  const supabase = await createClient();
  const { error } = await supabase
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
 * Restaura una reseña que estaba marcada como eliminada (volver a
 * removed_at = NULL). Usado cuando se marcó por error, o cuando Google
 * la vuelve a mostrar y el admin quiere reactivarla a mano (el cron lo
 * haría también en el siguiente run, pero acelera).
 */
export async function restoreReview(reviewId: string) {
  const parsed = reviewIdSchema.safeParse(reviewId);
  if (!parsed.success) return { ok: false as const, error: "Id inválido." };

  const actor = await getRemovalActor();
  if (!actor) return { ok: false as const, error: "No autorizado." };
  const inScope = await assertReviewInScope(actor, parsed.data);
  if (!inScope.ok) return { ok: false as const, error: inScope.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ removed_at: null } as never)
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
