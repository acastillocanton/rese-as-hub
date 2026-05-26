import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getValidAccessTokenForLocation,
  listReviews,
  starRatingToInt,
  type GoogleReview,
} from "@/lib/google/business-profile";
import {
  processFreshReviews,
  flushNotifications,
  flushLowRatingAlerts,
  type LocationSummary,
  type SalesInfo,
  type FreshReview,
  type PendingNotification,
  type LowRatingAlertContext,
} from "@/lib/cron/process-reviews";
import {
  resolveLowRatingRecipients,
  type LowRatingAlert,
} from "@/lib/cron/low-rating-alerts";
import { notifyNewReview } from "@/lib/email/notify-new-review";
import { notifyLowRating } from "@/lib/email/notify-low-rating";
import type { Brand, ProfileStatus } from "@/lib/supabase/types";

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

  // Cargamos en paralelo: locations conectadas + sales + admins + managers
  // (los dos últimos para alertas ≤2★ multi-stakeholder).
  const [locationsRes, salesRes, adminsRes, managersRes] = await Promise.all([
    admin
      .from("locations")
      .select("id, name, google_location_resource, google_place_id, brand")
      .eq("oauth_status", "connected")
      .not("google_location_resource", "is", null)
      .returns<{
        id: string;
        name: string;
        google_location_resource: string;
        google_place_id: string | null;
        brand: Brand;
      }[]>(),
    admin
      .from("profiles")
      .select("id, full_name, email, status, director_id")
      .in("role", ["sales", "office_director"])
      .returns<{
        id: string;
        full_name: string;
        email: string | null;
        status: string;
        director_id: string | null;
      }[]>(),
    admin
      .from("profiles")
      .select("id, email, status")
      .eq("role", "admin")
      .returns<{ id: string; email: string | null; status: string }[]>(),
    admin
      .from("profiles")
      .select("id, email, status")
      .eq("role", "reviews_manager")
      .returns<{ id: string; email: string | null; status: string }[]>(),
  ]);
  const connectedLocations = locationsRes.data ?? null;
  const locsErr = locationsRes.error;
  const salesById = new Map<
    string,
    SalesInfo & { director_id: string | null }
  >();
  for (const s of salesRes.data ?? []) {
    salesById.set(s.id, {
      full_name: s.full_name,
      email: s.email,
      status: s.status,
      director_id: s.director_id,
    });
  }
  // directorBySalesId[sales_id] → profile del director responsable.
  const directorBySalesId = new Map<
    string,
    { id: string; email: string | null; status: ProfileStatus }
  >();
  for (const s of salesRes.data ?? []) {
    if (s.director_id) {
      const dir = salesById.get(s.director_id);
      if (dir) {
        directorBySalesId.set(s.id, {
          id: s.director_id,
          email: dir.email,
          status: dir.status as ProfileStatus,
        });
      }
    }
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

  const summary: LocationSummary[] = [];

  // Mapa brand por location para el flush de alertas ≤2★.
  const brandByLocationId = new Map<string, Brand>();
  for (const l of connectedLocations) {
    brandByLocationId.set(l.id, l.brand);
  }

  // Acumulamos las notificaciones de TODAS las locations y las enviamos en
  // paralelo al final (Promise.allSettled). Antes hacíamos await dentro del
  // loop por cada reseña → si entraban 50, eran 50 envíos SMTP secuenciales
  // y el cron podía exceder los 60s de Vercel.
  const pendingNotifications: PendingNotification[] = [];
  const lowRatingAlerts: LowRatingAlert[] = [];
  const clientIdsSeen = new Set<string>();

  for (const loc of connectedLocations) {
    const entry: LocationSummary = {
      location_id: loc.id,
      location_name: loc.name,
      fetched: 0,
      new_reviews: 0,
      counted: 0,
      pending: 0,
      unmatched: 0,
    };

    // Lock optimista contra solapamiento: si otro cron procesó esta
    // location en los últimos 60s, abortamos. Postgres garantiza que
    // UPDATE con filtro temporal es atómico — solo uno gana la carrera.
    const lockCutoff = new Date(Date.now() - 60_000).toISOString();
    const { data: lockRows, error: lockErr } = await admin
      .from("locations")
      .update({ oauth_last_sync_at: new Date().toISOString() } as never)
      .eq("id", loc.id)
      .or(`oauth_last_sync_at.is.null,oauth_last_sync_at.lt.${lockCutoff}`)
      .select("id");
    if (lockErr) {
      entry.error = `lock_failed: ${lockErr.message}`;
      summary.push(entry);
      continue;
    }
    if (!lockRows || lockRows.length === 0) {
      entry.error = "skipped_concurrent_run";
      summary.push(entry);
      continue;
    }

    try {
      const accessToken = await getValidAccessTokenForLocation(loc.id);
      if (!accessToken) {
        entry.error = "no_refresh_token";
        await markSyncError(admin, loc.id, entry.error);
        summary.push(entry);
        continue;
      }

      // Paginación: la API v4 ordena por updateTime desc, así que avanzamos
      // hasta que una página entera ya esté en DB (alcanzamos backlog
      // sincronizado) o se acabe nextPageToken. MAX_PAGES (10 × 50 = 500)
      // limita el primer cron sobre una ficha con histórico enorme.
      const MAX_PAGES = 10;
      const PAGE_SIZE = 50;
      const googleReviews: GoogleReview[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const { reviews: pageReviews, nextPageToken } = await listReviews(
          accessToken,
          loc.google_location_resource,
          { pageSize: PAGE_SIZE, pageToken },
        );
        if (pageReviews.length === 0) break;
        googleReviews.push(...pageReviews);

        // Si toda la página ya está en DB, no merece la pena pedir más:
        // las siguientes son más antiguas todavía y ya las tenemos.
        const pageIds = pageReviews.map((r) => r.reviewId);
        const { data: existingInPage } = await admin
          .from("reviews")
          .select("google_review_id")
          .eq("location_id", loc.id)
          .in("google_review_id", pageIds)
          .returns<{ google_review_id: string }[]>();
        if ((existingInPage?.length ?? 0) === pageReviews.length) break;

        if (!nextPageToken) break;
        pageToken = nextPageToken;
      }
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

      // Convertimos las reseñas de Google al shape común y delegamos en el
      // helper compartido con el cron de Places (matcher + insert + notif).
      const freshNormalized: FreshReview[] = fresh.map((gr) => {
        const rawAuthor = gr.reviewer?.displayName?.trim() ?? "";
        const hasAuthorName = rawAuthor.length > 0;
        return {
          google_review_id: gr.reviewId,
          author_name: hasAuthorName ? rawAuthor : "Anónimo",
          hasAuthorName,
          rating: starRatingToInt(gr.starRating),
          text: gr.comment ?? null,
          google_created_at: gr.createTime,
        };
      });

      const { notifications, lowRatingAlerts: locLowRating } =
        await processFreshReviews(
          {
            admin,
            location: {
              id: loc.id,
              name: loc.name,
              brand: loc.brand,
              place_id: loc.google_place_id,
            },
            fresh: freshNormalized,
            salesById,
            source: "business_profile",
          },
          entry,
        );
      pendingNotifications.push(...notifications);
      lowRatingAlerts.push(...locLowRating);
      for (const a of locLowRating) {
        if (a.clientId) clientIdsSeen.add(a.clientId);
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

  const notifResult = await flushNotifications(
    admin,
    pendingNotifications,
    notifyNewReview,
    appBase,
  );

  // Nombres de cliente para el email de alerta ≤2★ (cuando hay client_id).
  const clientNameById = new Map<string, string>();
  if (clientIdsSeen.size > 0) {
    const { data: clientsRes } = await admin
      .from("clients")
      .select("id, full_name")
      .in("id", [...clientIdsSeen])
      .returns<{ id: string; full_name: string }[]>();
    for (const c of clientsRes ?? []) {
      clientNameById.set(c.id, c.full_name);
    }
  }

  const lowRatingCtx: LowRatingAlertContext = {
    admins: (adminsRes.data ?? []).map((a) => ({
      id: a.id,
      email: a.email,
      status: a.status as ProfileStatus,
    })),
    managers: (managersRes.data ?? []).map((m) => ({
      id: m.id,
      email: m.email,
      status: m.status as ProfileStatus,
    })),
    directorBySalesId,
    salesById,
    brandByLocationId,
    clientNameById,
    appBase,
  };
  const lowRatingResult = await flushLowRatingAlerts(
    admin,
    lowRatingAlerts,
    lowRatingCtx,
    notifyLowRating,
    resolveLowRatingRecipients,
  );

  return NextResponse.json({
    ok: true,
    locations_processed: summary.length,
    notify_attempted: notifResult.attempted,
    notify_failed: notifResult.failed,
    low_rating_alerts_attempted: lowRatingResult.attempted,
    low_rating_alerts_failed: lowRatingResult.failed,
    low_rating_alerts_skipped: lowRatingResult.skipped,
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
