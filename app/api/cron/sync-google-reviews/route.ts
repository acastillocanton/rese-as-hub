import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getValidAccessTokenForLocation,
  listReviews,
  starRatingToInt,
} from "@/lib/google/business-profile";
import {
  attributeReview,
  TEMPORAL_WINDOW_HOURS,
  type ShareLinkCandidate,
} from "@/lib/matching/attribute-review";
import { notifyNewReview } from "@/lib/email/notify-new-review";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron entry point. Configurar el schedule en vercel.json:
 *   { "crons": [{ "path": "/api/cron/sync-google-reviews", "schedule": "*\/10 * * * *" }] }
 *
 * Protegido por shared secret (CRON_SECRET) que Vercel manda como
 * Authorization header. Localmente:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" \
 *     http://localhost:3000/api/cron/sync-google-reviews
 *
 * Estrategia por ficha conectada:
 *   1. Obtiene access_token válido (refresh automático).
 *   2. Pide la primera página de reviews ordenadas por updateTime desc.
 *   3. Filtra las que ya están en DB (idempotente vía unique constraint).
 *   4. Carga share_links de esa location dentro de la ventana temporal.
 *   5. Llama attributeReview() para cada reseña nueva, inserta en reviews.
 *   6. Actualiza locations.oauth_last_sync_at / oauth_last_sync_error.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || !auth || !secretMatches(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient();

  // Cargamos en paralelo: locations conectadas + mapa de comerciales para
  // notificar por email cuando entre una reseña con match='counted'.
  const [locationsRes, salesRes] = await Promise.all([
    admin
      .from("locations")
      .select("id, name, google_location_resource")
      .eq("oauth_status", "connected")
      .not("google_location_resource", "is", null)
      .returns<{ id: string; name: string; google_location_resource: string }[]>(),
    admin
      .from("profiles")
      .select("id, full_name, email, status")
      .eq("role", "sales")
      .returns<{ id: string; full_name: string; email: string | null; status: string }[]>(),
  ]);
  const connectedLocations = locationsRes.data ?? null;
  const locsErr = locationsRes.error;
  const salesById = new Map<string, { full_name: string; email: string | null; status: string }>();
  for (const s of salesRes.data ?? []) {
    salesById.set(s.id, { full_name: s.full_name, email: s.email, status: s.status });
  }
  const appBase =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  if (locsErr) {
    console.error("[cron] failed listing connected locations:", locsErr);
    return NextResponse.json({ error: locsErr.message }, { status: 500 });
  }

  if (!connectedLocations || connectedLocations.length === 0) {
    return NextResponse.json({ ok: true, locations_processed: 0 });
  }

  const summary: Array<{
    location_id: string;
    location_name: string;
    fetched: number;
    new_reviews: number;
    counted: number;
    pending: number;
    unmatched: number;
    error?: string;
  }> = [];

  for (const loc of connectedLocations) {
    const entry = {
      location_id: loc.id,
      location_name: loc.name,
      fetched: 0,
      new_reviews: 0,
      counted: 0,
      pending: 0,
      unmatched: 0,
      error: undefined as string | undefined,
    };

    try {
      const accessToken = await getValidAccessTokenForLocation(loc.id);
      if (!accessToken) {
        entry.error = "no_refresh_token";
        await markSyncError(admin, loc.id, entry.error);
        summary.push(entry);
        continue;
      }

      const { reviews: googleReviews } = await listReviews(
        accessToken,
        loc.google_location_resource,
        { pageSize: 50 },
      );
      entry.fetched = googleReviews.length;

      if (googleReviews.length === 0) {
        await markSyncOk(admin, loc.id);
        summary.push(entry);
        continue;
      }

      const ids = googleReviews.map((r) => r.reviewId);
      const { data: existing } = await admin
        .from("reviews")
        .select("google_review_id")
        .eq("location_id", loc.id)
        .in("google_review_id", ids)
        .returns<{ google_review_id: string }[]>();
      const existingSet = new Set((existing ?? []).map((r) => r.google_review_id));
      const fresh = googleReviews.filter((r) => !existingSet.has(r.reviewId));

      if (fresh.length === 0) {
        await markSyncOk(admin, loc.id);
        summary.push(entry);
        continue;
      }

      // Cargamos share_links de la location en una sola query, cubriendo la
      // ventana más antigua entre las reseñas nuevas. Luego attributeReview
      // filtra por ventana específica por reseña.
      const oldestReviewMs = fresh
        .map((r) => new Date(r.createTime).getTime())
        .reduce((min, t) => Math.min(min, t), Number.POSITIVE_INFINITY);
      const windowStart = new Date(
        oldestReviewMs - TEMPORAL_WINDOW_HOURS * 3_600_000,
      ).toISOString();

      const { data: shareRows } = await admin
        .from("share_links")
        .select(
          "id, sales_id, client_id, opened_at, clients:clients(full_name)",
        )
        .eq("location_id", loc.id)
        .gte("opened_at", windowStart)
        .returns<
          {
            id: string;
            sales_id: string;
            client_id: string | null;
            opened_at: string;
            clients: { full_name: string } | null;
          }[]
        >();

      const allCandidates: ShareLinkCandidate[] = (shareRows ?? []).map((s) => ({
        id: s.id,
        sales_id: s.sales_id,
        client_id: s.client_id,
        client_full_name: s.clients?.full_name ?? null,
        opened_at: s.opened_at,
      }));

      for (const gr of fresh) {
        const result = attributeReview(
          {
            google_review_id: gr.reviewId,
            author_name: gr.reviewer?.displayName ?? "Anónimo",
            google_created_at: gr.createTime,
          },
          allCandidates,
        );

        const row = {
          location_id: loc.id,
          google_review_id: gr.reviewId,
          author_name: gr.reviewer?.displayName ?? "Anónimo",
          rating: starRatingToInt(gr.starRating),
          text: gr.comment ?? null,
          google_created_at: gr.createTime,
          fetched_at: new Date().toISOString(),
          sales_id: result.sales_id ?? null,
          client_id: result.client_id ?? null,
          share_link_id: result.share_link_id ?? null,
          match_confidence: result.match_confidence,
          match_state: result.match_state,
          match_evidence: result.match_evidence,
        };

        const { error: insErr } = await admin
          .from("reviews")
          .insert(row as never);

        if (insErr) {
          console.error("[cron] insert review failed:", insErr, gr.reviewId);
          continue;
        }

        entry.new_reviews++;
        if (result.match_state === "counted") {
          entry.counted++;
          // Notificación al comercial. Fire-and-forget: si Resend falla o no
          // está configurado, el wrapper traga el error y el cron sigue.
          if (result.sales_id) {
            const sales = salesById.get(result.sales_id);
            if (sales?.email && sales.status === "active") {
              const clientName =
                (result.match_evidence?.client_full_name as string | undefined) ??
                null;
              await notifyNewReview({
                salesEmail: sales.email,
                salesName: sales.full_name,
                rating: starRatingToInt(gr.starRating),
                reviewText: gr.comment ?? null,
                authorName: gr.reviewer?.displayName ?? "Anónimo",
                clientFullName: clientName,
                locationName: loc.name,
                matchConfidence: result.match_confidence,
                appBase,
              });
            }
          }
        } else if (result.match_state === "pending") {
          entry.pending++;
        } else {
          entry.unmatched++;
        }
      }

      await markSyncOk(admin, loc.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] location ${loc.id} failed:`, msg);
      entry.error = msg;
      await markSyncError(admin, loc.id, msg);
    }

    summary.push(entry);
  }

  return NextResponse.json({
    ok: true,
    locations_processed: summary.length,
    summary,
  });
}

async function markSyncOk(
  admin: ReturnType<typeof createServiceClient>,
  locationId: string,
) {
  await admin
    .from("locations")
    .update({
      oauth_last_sync_at: new Date().toISOString(),
      oauth_last_sync_error: null,
    } as never)
    .eq("id", locationId);
}

async function markSyncError(
  admin: ReturnType<typeof createServiceClient>,
  locationId: string,
  error: string,
) {
  await admin
    .from("locations")
    .update({
      oauth_last_sync_at: new Date().toISOString(),
      oauth_last_sync_error: error.slice(0, 500),
    } as never)
    .eq("id", locationId);
}

function secretMatches(authHeader: string, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}
