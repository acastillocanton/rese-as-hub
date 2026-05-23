"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/audit";
import {
  attributeReview,
  TEMPORAL_WINDOW_HOURS,
  type ShareLinkCandidate,
  type MatchResult,
} from "@/lib/matching/attribute-review";
import { notifyNewReview } from "@/lib/email/notify-new-review";
import {
  importManualReviewSchema,
  looksAnonymous,
  toIsoUtc,
  type ImportManualReviewInput,
} from "./schema";

/**
 * Importación manual de reseñas. Vía de respaldo mientras esperamos la
 * aprobación de la cuota de Google Business Profile API. El admin o el
 * gestor pegan los datos visibles en Google Maps; el matcher decide la
 * atribución (igual que el cron), salvo que se fuerce manualmente con
 * forcedSalesId + forcedClientId.
 *
 * Idempotencia: `google_review_id` se genera con prefijo "manual:" + UUID
 * para que (a) no colisione con los IDs de Business Profile cuando llegue
 * la cuota y (b) se pueda distinguir en la BD a simple vista. El insert
 * pasa por service-client (bypass RLS) por consistencia con el cron.
 */

async function assertCanManageSales(): Promise<
  | { ok: true; actorId: string; actorRole: "admin" | "reviews_manager" }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };
  const { data: actor } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (actor?.role !== "admin" && actor?.role !== "reviews_manager") {
    return { ok: false, error: "No autorizado." };
  }
  return { ok: true, actorId: user.id, actorRole: actor.role };
}

export type ImportManualReviewResult =
  | {
      ok: true;
      reviewId: string;
      matchState: MatchResult["match_state"];
      matchConfidence: number;
    }
  | { ok: false; error: string };

export async function importManualReview(
  input: ImportManualReviewInput,
): Promise<ImportManualReviewResult> {
  const auth = await assertCanManageSales();
  if (!auth.ok) return auth;

  const parsed = importManualReviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const data = parsed.data;
  const admin = createServiceClient();
  const googleReviewId = `manual:${randomUUID()}`;
  const createdAtIso = toIsoUtc(data.googleCreatedAt);

  // Verificamos que la location existe (defensa en profundidad — el select
  // del form ya limita a opciones válidas, pero un cliente malicioso podría
  // mandar otro uuid).
  const { data: location } = await admin
    .from("locations")
    .select("id, name")
    .eq("id", data.locationId)
    .maybeSingle<{ id: string; name: string }>();
  if (!location) {
    return { ok: false, error: "La ficha indicada no existe." };
  }

  // Si el usuario forzó la atribución, validamos que el cliente realmente
  // pertenece al comercial. Saltamos el matcher por completo.
  let match: MatchResult;
  let forcedClientFullName: string | null = null;
  if (data.forcedSalesId) {
    const { data: salesProfile } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", data.forcedSalesId)
      .eq("role", "sales")
      .maybeSingle<{ id: string; role: string }>();
    if (!salesProfile) {
      return { ok: false, error: "El comercial indicado no existe o no es un comercial." };
    }
    if (data.forcedClientId) {
      const { data: clientRow } = await admin
        .from("clients")
        .select("id, full_name, sales_id")
        .eq("id", data.forcedClientId)
        .eq("sales_id", data.forcedSalesId)
        .maybeSingle<{ id: string; full_name: string; sales_id: string }>();
      if (!clientRow) {
        return {
          ok: false,
          error: "El cliente seleccionado no pertenece a ese comercial.",
        };
      }
      forcedClientFullName = clientRow.full_name;
    }
    match = {
      match_state: "counted",
      match_confidence: 100,
      match_evidence: {
        source: "manual_import",
        reason: "admin_forced",
        actor_id: auth.actorId,
        actor_role: auth.actorRole,
        client_full_name: forcedClientFullName,
      },
      sales_id: data.forcedSalesId,
      client_id: data.forcedClientId ?? undefined,
      share_link_id: undefined,
    };
  } else {
    // Sin atribución forzada → el matcher decide. Cargamos los share_links
    // de la location en la ventana 48h previa al timestamp indicado.
    const windowStart = new Date(
      new Date(createdAtIso).getTime() - TEMPORAL_WINDOW_HOURS * 3_600_000,
    ).toISOString();
    const { data: shareRows } = await admin
      .from("share_links")
      .select("id, sales_id, client_id, opened_at, clients:clients(full_name)")
      .eq("location_id", data.locationId)
      .gte("opened_at", windowStart)
      .order("opened_at", { ascending: false })
      .limit(10000)
      .returns<
        {
          id: string;
          sales_id: string;
          client_id: string | null;
          opened_at: string;
          clients: { full_name: string } | null;
        }[]
      >();

    const candidates: ShareLinkCandidate[] = (shareRows ?? []).map((s) => ({
      id: s.id,
      sales_id: s.sales_id,
      client_id: s.client_id,
      client_full_name: s.clients?.full_name ?? null,
      opened_at: s.opened_at,
    }));

    const anonymous = looksAnonymous(data.authorName);
    match = attributeReview(
      {
        google_review_id: googleReviewId,
        author_name: anonymous ? "Anónimo" : data.authorName,
        hasAuthorName: !anonymous,
        google_created_at: createdAtIso,
      },
      candidates,
    );
  }

  const row = {
    location_id: data.locationId,
    google_review_id: googleReviewId,
    author_name: data.authorName,
    rating: data.rating,
    text: data.text,
    google_created_at: createdAtIso,
    fetched_at: new Date().toISOString(),
    sales_id: match.sales_id ?? null,
    client_id: match.client_id ?? null,
    share_link_id: match.share_link_id ?? null,
    match_confidence: match.match_confidence,
    match_state: match.match_state,
    match_evidence: match.match_evidence,
    source: "manual" as const,
  };

  const { data: inserted, error: insErr } = await admin
    .from("reviews")
    .insert(row as never)
    .select("id")
    .single<{ id: string }>();

  if (insErr || !inserted) {
    console.error("[manual-import] insert review failed:", insErr);
    return {
      ok: false,
      error: `No se pudo insertar la reseña: ${insErr?.message ?? "error desconocido"}.`,
    };
  }

  await recordAudit({
    entityType: "review",
    entityId: inserted.id,
    action: "manual_import",
    payload: {
      actor_id: auth.actorId,
      actor_role: auth.actorRole,
      forced: Boolean(data.forcedSalesId),
      location_id: data.locationId,
      match_state: match.match_state,
      match_confidence: match.match_confidence,
    },
  });

  // Notificación al comercial si la reseña entra como counted.
  if (match.match_state === "counted" && match.sales_id) {
    const { data: sales } = await admin
      .from("profiles")
      .select("full_name, email, status")
      .eq("id", match.sales_id)
      .maybeSingle<{ full_name: string; email: string | null; status: string }>();
    if (sales?.email && sales.status === "active") {
      const appBase =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
        "http://localhost:3000";
      const clientNameFromEvidence =
        (match.match_evidence?.client_full_name as string | undefined) ?? null;
      try {
        await notifyNewReview({
          salesEmail: sales.email,
          salesName: sales.full_name,
          rating: data.rating,
          reviewText: data.text,
          authorName: data.authorName,
          clientFullName: clientNameFromEvidence,
          locationName: location.name,
          matchConfidence: match.match_confidence,
          appBase,
        });
      } catch (err) {
        // No fallamos la importación si el email no se pudo enviar. Lo
        // dejamos en audit_log para reintento desde /api/admin/notify-failed.
        const msg = err instanceof Error ? err.message : String(err);
        await recordAudit({
          entityType: "review",
          entityId: inserted.id,
          action: "notify_failed",
          payload: {
            sales_id: match.sales_id,
            sales_email: sales.email,
            google_review_id: googleReviewId,
            error: msg,
            source: "manual_import",
          },
        });
      }
    }
  }

  revalidatePath("/manager/resenas/importar");
  revalidatePath("/manager/resenas");
  revalidatePath("/resenas/verificacion");
  revalidatePath("/dashboard");

  return {
    ok: true,
    reviewId: inserted.id,
    matchState: match.match_state,
    matchConfidence: match.match_confidence,
  };
}
