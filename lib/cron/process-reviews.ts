import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import {
  attributeReview,
  TEMPORAL_WINDOW_HOURS,
  type ShareLinkCandidate,
} from "@/lib/matching/attribute-review";

/**
 * Helper compartido entre los crons de Business Profile y Places API.
 *
 * Inputs: una location, las reseñas frescas (ya filtradas contra DB y
 * convertidas al shape común) y un mapa de comerciales por id para encolar
 * notificaciones cuando entre una con match='counted'.
 *
 * Outputs: actualiza `entry` con contadores y devuelve el array de
 * notificaciones pendientes para que el caller las envíe en batch al final
 * con `Promise.allSettled` (igual que el cron actual).
 */

/** Shape mínimo de una reseña fresca para pasar por el matcher + insert. */
export type FreshReview = {
  google_review_id: string; // ya prefijado según source
  author_name: string;
  hasAuthorName: boolean;
  rating: number; // 1..5
  text: string | null;
  google_created_at: string; // ISO
};

export type LocationCtx = {
  id: string;
  name: string;
};

export type LocationSummary = {
  location_id: string;
  location_name: string;
  fetched: number;
  new_reviews: number;
  counted: number;
  pending: number;
  unmatched: number;
  error?: string;
};

export type PendingNotification = {
  salesEmail: string;
  salesName: string;
  rating: number;
  reviewText: string | null;
  authorName: string;
  clientFullName: string | null;
  locationName: string;
  matchConfidence: number;
  reviewDbId: string;
  salesId: string;
  googleReviewId: string;
};

export type SalesInfo = {
  full_name: string;
  email: string | null;
  status: string;
};

export type ProcessReviewsArgs = {
  admin: ReturnType<typeof createServiceClient>;
  location: LocationCtx;
  fresh: FreshReview[];
  salesById: Map<string, SalesInfo>;
  source: "business_profile" | "places_api";
};

/**
 * Carga share_links candidatos para una location dentro de la ventana
 * temporal cubriendo la reseña más antigua del batch. Igual que hacía el
 * cron de Business Profile inline.
 */
async function loadCandidates(
  admin: ProcessReviewsArgs["admin"],
  locationId: string,
  fresh: FreshReview[],
): Promise<ShareLinkCandidate[]> {
  if (fresh.length === 0) return [];
  const oldestMs = fresh
    .map((r) => new Date(r.google_created_at).getTime())
    .reduce((min, t) => Math.min(min, t), Number.POSITIVE_INFINITY);
  const windowStart = new Date(
    oldestMs - TEMPORAL_WINDOW_HOURS * 3_600_000,
  ).toISOString();

  const { data: shareRows } = await admin
    .from("share_links")
    .select("id, sales_id, client_id, opened_at, clients:clients(full_name)")
    .eq("location_id", locationId)
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

  return (shareRows ?? []).map((s) => ({
    id: s.id,
    sales_id: s.sales_id,
    client_id: s.client_id,
    client_full_name: s.clients?.full_name ?? null,
    opened_at: s.opened_at,
  }));
}

/**
 * Inserta cada reseña fresca pasando por el matcher. Acumula notificaciones
 * para envío en batch al final. Mutará `summary` con los contadores.
 */
export async function processFreshReviews(
  args: ProcessReviewsArgs,
  summary: LocationSummary,
): Promise<PendingNotification[]> {
  const { admin, location, fresh, salesById, source } = args;
  if (fresh.length === 0) return [];

  const candidates = await loadCandidates(admin, location.id, fresh);
  const notifications: PendingNotification[] = [];

  for (const fr of fresh) {
    const result = attributeReview(
      {
        google_review_id: fr.google_review_id,
        author_name: fr.author_name,
        hasAuthorName: fr.hasAuthorName,
        google_created_at: fr.google_created_at,
      },
      candidates,
    );

    const row = {
      location_id: location.id,
      google_review_id: fr.google_review_id,
      author_name: fr.author_name,
      rating: fr.rating,
      text: fr.text,
      google_created_at: fr.google_created_at,
      fetched_at: new Date().toISOString(),
      sales_id: result.sales_id ?? null,
      client_id: result.client_id ?? null,
      share_link_id: result.share_link_id ?? null,
      match_confidence: result.match_confidence,
      match_state: result.match_state,
      match_evidence: result.match_evidence,
      source,
    };

    const { data: inserted, error: insErr } = await admin
      .from("reviews")
      .insert(row as never)
      .select("id")
      .single<{ id: string }>();

    if (insErr || !inserted) {
      console.error("[cron] insert review failed:", insErr, fr.google_review_id);
      continue;
    }

    summary.new_reviews++;
    if (result.match_state === "counted") {
      summary.counted++;
      if (result.sales_id) {
        const sales = salesById.get(result.sales_id);
        if (sales?.email && sales.status === "active") {
          const clientName =
            (result.match_evidence?.client_full_name as string | undefined) ?? null;
          notifications.push({
            salesEmail: sales.email,
            salesName: sales.full_name,
            rating: fr.rating,
            reviewText: fr.text,
            authorName: fr.author_name,
            clientFullName: clientName,
            locationName: location.name,
            matchConfidence: result.match_confidence,
            reviewDbId: inserted.id,
            salesId: result.sales_id,
            googleReviewId: fr.google_review_id,
          });
        }
      }
    } else if (result.match_state === "pending") {
      summary.pending++;
    } else {
      summary.unmatched++;
    }
  }

  return notifications;
}

/**
 * Envía las notificaciones acumuladas en paralelo y registra los fallos en
 * audit_log (action='notify_failed'). Devuelve los contadores.
 */
export async function flushNotifications(
  admin: ProcessReviewsArgs["admin"],
  pending: PendingNotification[],
  notifyFn: (
    n: Omit<PendingNotification, "reviewDbId" | "salesId" | "googleReviewId"> & {
      appBase: string;
    },
  ) => Promise<
    | { ok: true }
    | { ok: false; status?: number; error?: string }
    | { ok: false; skipped: true; reason: string }
  >,
  appBase: string,
): Promise<{ attempted: number; failed: number }> {
  if (pending.length === 0) return { attempted: 0, failed: 0 };

  const results = await Promise.allSettled(
    pending.map((p) =>
      notifyFn({
        salesEmail: p.salesEmail,
        salesName: p.salesName,
        rating: p.rating,
        reviewText: p.reviewText,
        authorName: p.authorName,
        clientFullName: p.clientFullName,
        locationName: p.locationName,
        matchConfidence: p.matchConfidence,
        appBase,
      }),
    ),
  );

  const failedAuditRows: Array<Record<string, unknown>> = [];
  let failed = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const p = pending[i];
    if (!r || !p) continue;
    if (r.status === "rejected") {
      failed++;
      failedAuditRows.push({
        entity_type: "review",
        entity_id: p.reviewDbId,
        action: "notify_failed",
        payload: {
          sales_id: p.salesId,
          sales_email: p.salesEmail,
          google_review_id: p.googleReviewId,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        },
      });
      continue;
    }
    const sendRes = r.value;
    if (!sendRes.ok && !("skipped" in sendRes && sendRes.skipped)) {
      failed++;
      failedAuditRows.push({
        entity_type: "review",
        entity_id: p.reviewDbId,
        action: "notify_failed",
        payload: {
          sales_id: p.salesId,
          sales_email: p.salesEmail,
          google_review_id: p.googleReviewId,
          status: "status" in sendRes ? sendRes.status : null,
          error: "error" in sendRes ? sendRes.error : null,
        },
      });
    }
  }

  if (failedAuditRows.length > 0) {
    const { error: auditErr } = await admin
      .from("audit_log")
      .insert(failedAuditRows as never);
    if (auditErr) {
      console.error("[cron] failed to write notify_failed audit rows:", auditErr);
    }
  }

  return { attempted: pending.length, failed };
}
