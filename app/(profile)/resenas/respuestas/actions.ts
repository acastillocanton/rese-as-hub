"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/audit";
import {
  getValidAccessTokenForLocation,
  replyToReview,
} from "@/lib/google/business-profile";
import type { Role } from "@/lib/supabase/types";
import {
  canReplyToReviews,
  saveReplySchema,
  type SaveReplyInput,
} from "@/lib/auth/reply-gating";

const reviewIdSchema = z.string().uuid();

type Actor = { userId: string; role: Role };

/**
 * Resuelve el actor autenticado y verifica que puede responder reseñas
 * (admin / reviews_manager). Defensa en profundidad por encima del
 * middleware y la RLS. Ver CLAUDE.md §4.48.
 */
async function getReplyActor(): Promise<Actor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: Role }>();
  if (!data) return null;
  if (!canReplyToReviews(data.role)) return null;
  return { userId: user.id, role: data.role };
}

async function audit(
  entityId: string,
  action: string,
  payload: Record<string, unknown>,
) {
  await recordAudit({ entityType: "review", entityId, action, payload });
}

function revalidateReplyViews() {
  revalidatePath("/resenas/respuestas");
  revalidatePath("/manager/resenas");
}

/**
 * Flujo ASISTIDO: marca una reseña como respondida guardando el texto que el
 * gestor redactó (y que pega manualmente en Google). NO llama a Google.
 */
export async function saveReviewReply(input: SaveReplyInput) {
  const parsed = saveReplySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const actor = await getReplyActor();
  if (!actor) return { ok: false as const, error: "No autorizado." };

  // No respondemos reseñas eliminadas (soft-delete, mig 010).
  const adminSrv = createServiceClient();
  const { data: current } = await adminSrv
    .from("reviews")
    .select("removed_at")
    .eq("id", parsed.data.reviewId)
    .maybeSingle<{ removed_at: string | null }>();
  if (!current) return { ok: false as const, error: "Reseña no encontrada." };
  if (current.removed_at !== null) {
    return { ok: false as const, error: "Esta reseña fue eliminada." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({
      reply_text: parsed.data.text,
      replied_at: new Date().toISOString(),
      reply_by: actor.userId,
      reply_via: "manual",
    } as never)
    .eq("id", parsed.data.reviewId);
  if (error) {
    console.error("[respuestas] saveReviewReply failed:", error);
    return { ok: false as const, error: error.message };
  }

  await audit(parsed.data.reviewId, "reply_saved", {
    reply_by: actor.userId,
    actor_role: actor.role,
    reply_via: "manual",
    length: parsed.data.text.length,
  });
  revalidateReplyViews();
  return { ok: true as const };
}

/**
 * Revierte una reseña respondida a pendiente (se respondió por error o se va
 * a re-redactar). Limpia las 5 columnas de respuesta.
 */
export async function clearReviewReply(reviewId: string) {
  const parsed = reviewIdSchema.safeParse(reviewId);
  if (!parsed.success) return { ok: false as const, error: "Id inválido." };

  const actor = await getReplyActor();
  if (!actor) return { ok: false as const, error: "No autorizado." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({
      reply_text: null,
      replied_at: null,
      reply_by: null,
      reply_via: null,
      reply_synced_at: null,
    } as never)
    .eq("id", parsed.data);
  if (error) {
    console.error("[respuestas] clearReviewReply failed:", error);
    return { ok: false as const, error: error.message };
  }

  await audit(parsed.data, "reply_cleared", {
    cleared_by: actor.userId,
    actor_role: actor.role,
  });
  revalidateReplyViews();
  return { ok: true as const };
}

/**
 * FASE API (NO cableada en UI hoy — cuota Business Profile a 0). Publica la
 * respuesta directamente en Google vía Business Profile API y marca la reseña
 * con reply_via='api'. Solo aplica a reseñas con source='business_profile'
 * (las de Places usan google_review_id sintético "places:..." que no sirve
 * para el endpoint de reply — §4.17). Activar en el Bloque G de §4.26.
 */
export async function publishReviewReply(input: SaveReplyInput) {
  const parsed = saveReplySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const actor = await getReplyActor();
  if (!actor) return { ok: false as const, error: "No autorizado." };

  const adminSrv = createServiceClient();
  const { data: review } = await adminSrv
    .from("reviews")
    .select("location_id, google_review_id, source, removed_at")
    .eq("id", parsed.data.reviewId)
    .maybeSingle<{
      location_id: string;
      google_review_id: string;
      source: string;
      removed_at: string | null;
    }>();
  if (!review) return { ok: false as const, error: "Reseña no encontrada." };
  if (review.removed_at !== null) {
    return { ok: false as const, error: "Esta reseña fue eliminada." };
  }
  if (review.source !== "business_profile" || review.google_review_id.startsWith("places:")) {
    return {
      ok: false as const,
      error:
        "Esta reseña vino de Places API y no puede responderse por API todavía. Usa el flujo manual.",
    };
  }

  const { data: loc } = await adminSrv
    .from("locations")
    .select("google_location_resource")
    .eq("id", review.location_id)
    .maybeSingle<{ google_location_resource: string | null }>();
  if (!loc?.google_location_resource) {
    return { ok: false as const, error: "Ficha no conectada a Business Profile." };
  }

  const token = await getValidAccessTokenForLocation(review.location_id);
  if (!token) {
    return { ok: false as const, error: "Ficha sin acceso OAuth válido." };
  }

  try {
    await replyToReview(
      token,
      loc.google_location_resource,
      review.google_review_id,
      parsed.data.text,
    );
  } catch (e) {
    console.error("[respuestas] publishReviewReply failed:", e);
    return {
      ok: false as const,
      error: "Google rechazó la publicación. Inténtalo más tarde o usa el flujo manual.",
    };
  }

  const now = new Date().toISOString();
  const { error } = await adminSrv
    .from("reviews")
    .update({
      reply_text: parsed.data.text,
      replied_at: now,
      reply_by: actor.userId,
      reply_via: "api",
      reply_synced_at: now,
    } as never)
    .eq("id", parsed.data.reviewId);
  if (error) {
    console.error("[respuestas] publishReviewReply update failed:", error);
    return { ok: false as const, error: error.message };
  }

  await audit(parsed.data.reviewId, "reply_published", {
    reply_by: actor.userId,
    actor_role: actor.role,
    reply_via: "api",
    length: parsed.data.text.length,
  });
  revalidateReplyViews();
  return { ok: true as const };
}
