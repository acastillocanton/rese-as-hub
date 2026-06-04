import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import {
  attributeReview,
  TEMPORAL_WINDOW_HOURS,
  type ShareLinkCandidate,
  type CommercialInfo,
} from "@/lib/matching/attribute-review";

// Re-export para que los crons (callers) tipen el roster sin importar dos
// módulos distintos.
export type { CommercialInfo };
import { decideDuplicateForClient } from "@/lib/cron/duplicate-detection";
import { decideEditMerge } from "@/lib/cron/edit-merge";
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
  /** Reseñas frescas que resultaron ser una EDICIÓN de una existente (mismo
   *  autor+ficha) y se fusionaron en vez de insertarse. Opcional para no
   *  obligar a tocar todos los sitios que construyen el summary. Ver §4.41. */
  merged?: number;
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
  /** Roster de comerciales (sales + office_director NO archivados) de ESTA
   *  ficha. Lo usa el rescate por mención del matcher cuando el texto nombra a
   *  un comercial sin enlace en ventana. Vacío si no se pasa. */
  commercials?: CommercialInfo[];
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
  const commercials = args.commercials ?? [];
  if (fresh.length === 0) return { notifications: [], lowRatingAlerts: [] };

  const rawCandidates = await loadCandidates(admin, location.id, fresh);
  // Enriquecemos cada candidato con el nombre del comercial dueño del enlace,
  // que el matcher necesita para detectar la mención del comercial en el texto.
  const candidates: ShareLinkCandidate[] = rawCandidates.map((c) => ({
    ...c,
    sales_full_name: salesById.get(c.sales_id)?.full_name ?? null,
  }));
  const notifications: PendingNotification[] = [];
  const lowRatingAlerts: LowRatingAlert[] = [];

  for (const fr of fresh) {
    // Fusión por autor: Google permite UNA reseña por persona y negocio, así
    // que una reseña fresca cuyo author_name (no anónimo) ya existe en esta
    // ficha es la MISMA reseña editada (Places sintetiza un id nuevo al cambiar
    // el timestamp). En vez de insertar un duplicado fantasma, actualizamos la
    // fila existente conservando su atribución. Ver CLAUDE.md §4.41.
    // Solo el path de Places sufre el problema (id sintético que cambia al
    // editar). Business Profile tiene reviewId estable → su edición se filtra
    // como no-fresh y ni llega aquí (se tratará aparte, §4.26). Acotamos a
    // incumbentes `places:%` para no cruzar fuentes.
    if (source === "places_api" && fr.hasAuthorName) {
      const { data: incRows } = await admin
        .from("reviews")
        .select(
          "id, rating, removed_at, low_rating_alerted_at, match_state, sales_id, client_id",
        )
        .eq("location_id", location.id)
        .like("google_review_id", "places:%")
        .eq("author_name", fr.author_name)
        .neq("google_review_id", fr.google_review_id)
        .returns<
          {
            id: string;
            rating: number;
            removed_at: string | null;
            low_rating_alerted_at: string | null;
            match_state: "counted" | "pending" | "unmatched";
            sales_id: string | null;
            client_id: string | null;
          }[]
        >();

      const incumbents = incRows ?? [];
      const decision = decideEditMerge({
        hasAuthorName: true,
        incumbents: incumbents.map((r) => ({
          id: r.id,
          rating: r.rating,
          removed_at: r.removed_at,
          low_rating_alerted_at: r.low_rating_alerted_at,
        })),
        incomingRating: fr.rating,
      });

      if (decision.action === "merge") {
        const inc = incumbents.find((r) => r.id === decision.incumbentId);
        const update: Record<string, unknown> = {
          google_review_id: fr.google_review_id,
          rating: fr.rating,
          text: fr.text,
          google_created_at: fr.google_created_at,
          fetched_at: new Date().toISOString(),
        };
        if (decision.clearRemovedAt) update.removed_at = null;
        if (decision.reAlertLowRating) update.low_rating_alerted_at = null;

        const { error: mergeErr } = await admin
          .from("reviews")
          .update(update as never)
          .eq("id", decision.incumbentId);

        if (mergeErr) {
          console.error(
            "[cron] edit-merge update failed:",
            mergeErr,
            fr.google_review_id,
          );
          await admin.from("audit_log").insert({
            entity_type: "review",
            entity_id: decision.incumbentId,
            action: "review_edit_merge_failed",
            payload: {
              google_review_id: fr.google_review_id,
              author_name: fr.author_name,
              source,
              error: mergeErr.message,
            },
          } as never);
          // No insertamos fila nueva (evitamos el duplicado que queríamos
          // prevenir). La reseña sigue siendo "fresca" → se reintenta en el
          // siguiente sync.
          continue;
        }

        summary.merged = (summary.merged ?? 0) + 1;
        await admin.from("audit_log").insert({
          entity_type: "review",
          entity_id: decision.incumbentId,
          action: "review_edit_merged",
          payload: {
            author_name: fr.author_name,
            source,
            new_google_review_id: fr.google_review_id,
            new_rating: fr.rating,
            old_rating: inc?.rating ?? null,
            re_alert_low_rating: decision.reAlertLowRating,
          },
        } as never);

        // Si la edición baja a ≤2★ por primera vez, re-alertar (el UPDATE ya
        // limpió low_rating_alerted_at; flushLowRatingAlerts lo re-sella).
        if (decision.reAlertLowRating && inc) {
          lowRatingAlerts.push({
            reviewId: inc.id,
            rating: fr.rating,
            authorName: fr.author_name,
            reviewText: fr.text,
            locationId: location.id,
            locationName: location.name,
            placeId: location.place_id,
            matchState: inc.match_state,
            salesId: inc.sales_id,
            clientId: inc.client_id,
          });
        }
        continue;
      }
    }

    const result = attributeReview(
      {
        google_review_id: fr.google_review_id,
        author_name: fr.author_name,
        hasAuthorName: fr.hasAuthorName,
        text: fr.text,
        google_created_at: fr.google_created_at,
      },
      candidates,
      commercials,
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
