"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/audit";
import type { Role } from "@/lib/supabase/types";
import {
  canEditReviewMapsUrl,
  setMapsUrlSchema,
  type SetMapsUrlInput,
} from "@/lib/auth/maps-url-gating";
import { isDeepReviewUrl, isMapsShortShareUrl } from "@/lib/google/review-url";

/**
 * Pegado manual de deep-links de reseña (§4.54, Capa 3). Ninguna API oficial
 * da la URL por reseña, pero el enlace de "Compartir reseña" de Google Maps sí;
 * un gestor lo pega aquí y la reseña pasa a deep-link al instante (la capa de
 * presentación ya lee `google_maps_url`, ver lib/google/review-url.ts).
 *
 * Gating admin + reviews_manager (defensa en profundidad sobre la RLS).
 */

const reviewIdSchema = z.string().uuid();

type Actor = { userId: string; role: Role };

async function getMapsUrlActor(): Promise<Actor | null> {
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
  if (!data || !canEditReviewMapsUrl(data.role)) return null;
  return { userId: user.id, role: data.role };
}

/**
 * Expande un enlace corto de compartir (`maps.app.goo.gl/…`) a su URL
 * canónica siguiendo el redirect. Solo se llama con hosts ya validados por
 * `isMapsShortShareUrl` (guarda anti-SSRF). Devuelve null si falla.
 */
async function expandShareUrl(shortUrl: string): Promise<string | null> {
  try {
    const res = await fetch(shortUrl, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "es" },
    });
    return res.url || null;
  } catch {
    return null;
  }
}

function revalidateReviewViews() {
  revalidatePath("/manager/resenas");
  revalidatePath("/resenas/verificacion");
  revalidatePath("/resenas/respuestas");
}

/**
 * Guarda el deep-link de una reseña a partir de lo que pega el gestor: el
 * enlace de "Compartir reseña" (corto, se expande) o el deep-link canónico.
 * La URL final debe contener `/maps/reviews/`; si no, se rechaza.
 */
export async function setReviewMapsUrl(input: SetMapsUrlInput) {
  const parsed = setMapsUrlSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const actor = await getMapsUrlActor();
  if (!actor) return { ok: false as const, error: "No autorizado." };

  // Resolver la URL canónica: si es corta, expandir; si ya es deep-link, usar.
  let canonical = parsed.data.url;
  if (isMapsShortShareUrl(canonical)) {
    const expanded = await expandShareUrl(canonical);
    if (!expanded) {
      return {
        ok: false as const,
        error: "No pude expandir el enlace corto. Abre el enlace en el navegador y pega la URL final (la que contiene /maps/reviews/).",
      };
    }
    canonical = expanded;
  }
  if (!isDeepReviewUrl(canonical)) {
    return {
      ok: false as const,
      error: "Ese enlace no apunta a una reseña concreta (no contiene /maps/reviews/). Usa el botón 'Compartir reseña' de Google.",
    };
  }

  // No tocamos reseñas eliminadas (soft-delete, mig 010).
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
      google_maps_url: canonical,
      maps_url_matched_at: new Date().toISOString(),
    } as never)
    .eq("id", parsed.data.reviewId);
  if (error) {
    console.error("[maps-url] setReviewMapsUrl failed:", error);
    return { ok: false as const, error: error.message };
  }

  await recordAudit({
    entityType: "review",
    entityId: parsed.data.reviewId,
    action: "review_maps_url_pasted",
    payload: { by: actor.userId, actor_role: actor.role },
  });
  revalidateReviewViews();
  return { ok: true as const, url: canonical };
}

/** Quita el deep-link manual (revierte a la lista de la ficha en la UI). */
export async function clearReviewMapsUrl(reviewId: string) {
  const parsed = reviewIdSchema.safeParse(reviewId);
  if (!parsed.success) return { ok: false as const, error: "Id inválido." };

  const actor = await getMapsUrlActor();
  if (!actor) return { ok: false as const, error: "No autorizado." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ google_maps_url: null, maps_url_matched_at: null } as never)
    .eq("id", parsed.data);
  if (error) {
    console.error("[maps-url] clearReviewMapsUrl failed:", error);
    return { ok: false as const, error: error.message };
  }

  await recordAudit({
    entityType: "review",
    entityId: parsed.data,
    action: "review_maps_url_cleared",
    payload: { by: actor.userId, actor_role: actor.role },
  });
  revalidateReviewViews();
  return { ok: true as const };
}
