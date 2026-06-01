import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import {
  attributeReview,
  TEMPORAL_WINDOW_HOURS,
  type ShareLinkCandidate,
} from "@/lib/matching/attribute-review";
import { decideDuplicateForClient } from "@/lib/cron/duplicate-detection";
import { isLowRating, type LowRatingAlert } from "@/lib/cron/low-rating-alerts";
import type { Brand } from "@/lib/supabase/types";

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
  brand: Brand;
  /** Para el CTA "Ver en Google" del email de alerta ≤2★. Si la ficha
   *  no lo tiene configurado, el CTA se omite. */
  place_id: string | null;
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
  brand: Brand;
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
 * (al sales atribuido) Y alertas ≤2★ (admin + manager + director + sales)
 * para envío en batch al final. Mutará `summary` con los contadores.
 */
export async function processFreshReviews(
  args: ProcessReviewsArgs,
  summary: LocationSummary,
): Promise<{
  notifications: PendingNotification[];
  lowRatingAlerts: LowRatingAlert[];
}> {
  const { admin, location, fresh, salesById, source } = args;
  if (fresh.length === 0) return { notifications: [], lowRatingAlerts: [] };

  const candidates = await loadCandidates(admin, location.id, fresh);
  const notifications: PendingNotification[] = [];
  const lowRatingAlerts: LowRatingAlert[] = [];

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

    // Anti-fraude (migración 015): si esta reseña va a un client_id que ya
    // tiene una principal, marcarla como duplicada. Si la entrante es MÁS
    // antigua que la principal existente, invertimos (la nueva pasa a
    // principal y demotamos la vieja).
    const dup = result.client_id
      ? await decideDuplicateForClient(admin, {
          clientId: result.client_id,
          incomingGoogleCreatedAt: fr.google_created_at,
        })
      : { newIsDuplicate: false, demotedReviewId: null };

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
      is_duplicate: dup.newIsDuplicate,
    };

    const { data: inserted, error: insErr } = await admin
      .from("reviews")
      .insert(row as never)
      .select("id")
      .single<{ id: string }>();

    if (insErr || !inserted) {
      console.error("[cron] insert review failed:", insErr, fr.google_review_id);
      // Visibilidad: una reseña "fresca" (no detectada como existente) que
      // falla al insertar suele ser una colisión del unique(location_id,
      // google_review_id) — p.ej. IDs sintéticos de dos autores anónimos en el
      // mismo segundo (ver lib/google/places.ts). Antes se perdía en silencio
      // (incluida una posible alerta ≤2★). Dejamos traza para detectarlo.
      await admin.from("audit_log").insert({
        entity_type: "review",
        entity_id: location.id,
        action: "insert_collision",
        payload: {
          location_id: location.id,
          google_review_id: fr.google_review_id,
          author_name: fr.author_name,
          rating: fr.rating,
          source,
          error: insErr?.message ?? null,
        },
      } as never);
      continue;
    }

    if (dup.demotedReviewId) {
      const { error: demoteErr } = await admin
        .from("reviews")
        .update({ is_duplicate: true } as never)
        .eq("id", dup.demotedReviewId);
      if (demoteErr) {
        console.error(
          "[cron] demote principal failed:",
          demoteErr,
          dup.demotedReviewId,
        );
        // Fail-safe anti-doble-conteo: la nueva se insertó como principal pero
        // la vieja NO se pudo demotar → quedarían DOS principales para el mismo
        // cliente (inflaría KPIs/comisión). Revertimos la nueva a duplicada
        // (sesgo a infra-contar, nunca sobre-contar) y dejamos traza.
        await admin
          .from("reviews")
          .update({ is_duplicate: true } as never)
          .eq("id", inserted.id);
        await admin.from("audit_log").insert({
          entity_type: "review",
          entity_id: inserted.id,
          action: "demote_failed_failsafe_duplicate",
          payload: {
            intended_demote: dup.demotedReviewId,
            google_review_id: fr.google_review_id,
            source,
          },
        } as never);
      } else {
        await admin.from("audit_log").insert({
          entity_type: "review",
          entity_id: dup.demotedReviewId,
          action: "demoted_by_older_duplicate",
          payload: {
            promoted_review_id: inserted.id,
            promoted_google_review_id: fr.google_review_id,
            source,
          },
        } as never);
      }
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
            brand: location.brand,
          });
        }
      }
    } else if (result.match_state === "pending") {
      summary.pending++;
    } else {
      summary.unmatched++;
    }

    // Alerta ≤2★: independiente del match_state. La idempotencia REAL la
    // garantiza el INSERT inicial: sólo procesamos reseñas frescas (no
    // existentes por unique(location_id, google_review_id)), así que un re-run
    // no las re-inserta ni re-alerta. `low_rating_alerted_at` se rellena tras
    // el envío (trazabilidad / posible reconciliación futura), pero hoy NO se
    // lee en el flujo de sync — no construir defensas asumiendo que filtra.
    if (isLowRating(fr.rating)) {
      lowRatingAlerts.push({
        reviewId: inserted.id,
        rating: fr.rating,
        authorName: fr.author_name,
        reviewText: fr.text,
        locationId: location.id,
        locationName: location.name,
        placeId: location.place_id,
        matchState: result.match_state,
        salesId: result.sales_id ?? null,
        clientId: result.client_id ?? null,
      });
    }
  }

  return { notifications, lowRatingAlerts };
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
        brand: p.brand,
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

// ─────────────────────────────────────────────────────────────────────────────
// Alertas ≤2★ — flush.
//
// Sigue el mismo patrón que flushNotifications: Promise.allSettled +
// audit_log de fallos. Además marca reviews.low_rating_alerted_at en cada
// envío exitoso para garantizar idempotencia ante re-runs del cron.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProfileLite, SalesLite } from "@/lib/cron/low-rating-alerts";

export type LowRatingAlertContext = {
  admins: ProfileLite[];
  managers: ProfileLite[];
  /** Mapa para resolver el director responsable cuando matchState es
   *  counted/pending. Indexado por sales_id (no por director_id). */
  directorBySalesId: Map<string, ProfileLite>;
  /** Mapa de sales por id — para nombre y email. Indexado por sales_id. */
  salesById: Map<string, SalesInfo & { director_id: string | null }>;
  /** Marca por location_id — para construir el email con el branding. */
  brandByLocationId: Map<string, Brand>;
  /** Nombres de cliente por client_id — para mostrar en el email. */
  clientNameById: Map<string, string>;
  appBase: string;
};

type LowRatingNotifyInput = {
  rating: number;
  authorName: string;
  reviewText: string | null;
  locationName: string;
  matchState: "counted" | "pending" | "unmatched";
  salesName: string | null;
  clientName: string | null;
  reviewId: string;
  placeId: string | null;
  appBase: string;
  brand: Brand;
  to: string[];
};

type LowRatingNotifyResult =
  | { ok: true }
  | { ok: false; status?: number; error?: string }
  | { ok: false; skipped: true; reason: string };

type ResolveRecipients = (params: {
  matchState: "counted" | "pending" | "unmatched";
  sales: SalesLite | null;
  director: ProfileLite | null;
  admins: ProfileLite[];
  managers: ProfileLite[];
}) => string[];

export async function flushLowRatingAlerts(
  admin: ProcessReviewsArgs["admin"],
  alerts: LowRatingAlert[],
  ctx: LowRatingAlertContext,
  notifyFn: (input: LowRatingNotifyInput) => Promise<LowRatingNotifyResult>,
  resolveRecipients: ResolveRecipients,
): Promise<{ attempted: number; failed: number; skipped: number }> {
  if (alerts.length === 0) return { attempted: 0, failed: 0, skipped: 0 };

  let attempted = 0;
  let failed = 0;
  let skipped = 0;

  const results = await Promise.allSettled(
    alerts.map(async (a) => {
      const sales = a.salesId ? (ctx.salesById.get(a.salesId) ?? null) : null;
      const salesLite: SalesLite | null = sales
        ? {
            id: a.salesId!,
            email: sales.email,
            status: sales.status as ProfileLite["status"],
            director_id: sales.director_id ?? null,
          }
        : null;
      const director = a.salesId ? (ctx.directorBySalesId.get(a.salesId) ?? null) : null;

      const recipients = resolveRecipients({
        matchState: a.matchState,
        sales: salesLite,
        director,
        admins: ctx.admins,
        managers: ctx.managers,
      });

      if (recipients.length === 0) {
        return { reviewId: a.reviewId, status: "no_recipients" as const };
      }

      const brand = ctx.brandByLocationId.get(a.locationId);
      if (!brand) {
        return { reviewId: a.reviewId, status: "no_brand" as const };
      }

      attempted++;
      const sendRes = await notifyFn({
        rating: a.rating,
        authorName: a.authorName,
        reviewText: a.reviewText,
        locationName: a.locationName,
        matchState: a.matchState,
        salesName: sales?.full_name ?? null,
        clientName: a.clientId ? (ctx.clientNameById.get(a.clientId) ?? null) : null,
        reviewId: a.reviewId,
        placeId: a.placeId,
        appBase: ctx.appBase,
        brand,
        to: recipients,
      });

      if (!sendRes.ok) {
        return {
          reviewId: a.reviewId,
          status: "send_failed" as const,
          info: sendRes,
        };
      }

      // Marca idempotencia. Si esto falla no es crítico (el INSERT ya
      // garantiza que el cron no re-procesará la review), pero loggea.
      const { error: markErr } = await admin
        .from("reviews")
        .update({ low_rating_alerted_at: new Date().toISOString() } as never)
        .eq("id", a.reviewId);
      if (markErr) {
        console.error("[cron] failed to mark low_rating_alerted_at:", markErr);
      }

      return { reviewId: a.reviewId, status: "ok" as const };
    }),
  );

  const auditRows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const a = alerts[i];
    if (!r || !a) continue;
    if (r.status === "rejected") {
      failed++;
      auditRows.push({
        entity_type: "review",
        entity_id: a.reviewId,
        action: "low_rating_alert_failed",
        payload: {
          rating: a.rating,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        },
      });
      continue;
    }
    if (r.value.status === "no_recipients" || r.value.status === "no_brand") {
      skipped++;
      auditRows.push({
        entity_type: "review",
        entity_id: a.reviewId,
        action: "low_rating_alert_skipped",
        payload: { rating: a.rating, reason: r.value.status },
      });
    } else if (r.value.status === "send_failed") {
      failed++;
      const info = r.value.info;
      auditRows.push({
        entity_type: "review",
        entity_id: a.reviewId,
        action: "low_rating_alert_failed",
        payload: {
          rating: a.rating,
          error:
            "error" in info ? info.error : "reason" in info ? info.reason : "unknown",
        },
      });
    } else {
      auditRows.push({
        entity_type: "review",
        entity_id: a.reviewId,
        action: "low_rating_alerted",
        payload: { rating: a.rating, match_state: a.matchState },
      });
    }
  }

  if (auditRows.length > 0) {
    const { error: auditErr } = await admin
      .from("audit_log")
      .insert(auditRows as never);
    if (auditErr) {
      console.error("[cron] failed to write low_rating_alert audit rows:", auditErr);
    }
  }

  return { attempted, failed, skipped };
}
