"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";

const reviewIdSchema = z.string().uuid();

async function getAdminUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  return profile?.role === "admin" ? user.id : null;
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

  const adminId = await getAdminUserId();
  if (!adminId) return { ok: false as const, error: "No autorizado." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ match_state: "counted" } as never)
    .eq("id", parsed.data);
  if (error) {
    console.error("[verificacion] confirmReview failed:", error);
    return { ok: false as const, error: error.message };
  }

  await audit(parsed.data, "confirm", { confirmed_by: adminId });
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

  const adminId = await getAdminUserId();
  if (!adminId) return { ok: false as const, error: "No autorizado." };

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

  await audit(parsed.data, "reject", { rejected_by: adminId });
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

  const adminId = await getAdminUserId();
  if (!adminId) return { ok: false as const, error: "No autorizado." };

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
    reassigned_by: adminId,
    new_sales_id: parsed.data.salesId,
    new_client_id: parsed.data.clientId ?? null,
  });
  revalidatePath("/resenas/verificacion");
  return { ok: true as const };
}
