"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/audit";
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ match_state: "counted" } as never)
    .eq("id", parsed.data);
  if (error) {
    console.error("[verificacion] confirmReview failed:", error);
    return { ok: false as const, error: error.message };
  }

  await audit(parsed.data, "confirm", { confirmed_by: actor.userId, actor_role: actor.role });
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({
      match_state: "unmatched",
      sales_id: null,
      client_id: null,
      share_link_id: null,
    } as never)
    .eq("id", parsed.data);
  if (error) {
    console.error("[verificacion] rejectReview failed:", error);
    return { ok: false as const, error: error.message };
  }

  await audit(parsed.data, "reject", { rejected_by: actor.userId, actor_role: actor.role });
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
  // Director: el sales destino también debe estar en su ficha.
  if (actor.role === "office_director") {
    const adminSrv = createServiceClient();
    const { data: target } = await adminSrv
      .from("profiles")
      .select("location_id, role")
      .eq("id", parsed.data.salesId)
      .maybeSingle<{ location_id: string | null; role: Role }>();
    if (!target || target.role !== "sales") {
      return { ok: false as const, error: "Comercial destino no válido." };
    }
    if (target.location_id !== actor.locationId) {
      return { ok: false as const, error: "El comercial destino no es de tu oficina." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({
      match_state: "counted",
      sales_id: parsed.data.salesId,
      client_id: parsed.data.clientId ?? null,
    } as never)
    .eq("id", parsed.data.reviewId);
  if (error) {
    console.error("[verificacion] reassignReview failed:", error);
    return { ok: false as const, error: error.message };
  }

  await audit(parsed.data.reviewId, "reassign", {
    reassigned_by: actor.userId,
    actor_role: actor.role,
    new_sales_id: parsed.data.salesId,
    new_client_id: parsed.data.clientId ?? null,
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
