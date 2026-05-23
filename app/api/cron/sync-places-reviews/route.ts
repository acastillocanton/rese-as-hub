import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { listPlaceReviews, PlacesApiError } from "@/lib/google/places";
import {
  processFreshReviews,
  flushNotifications,
  type LocationSummary,
  type SalesInfo,
  type FreshReview,
  type PendingNotification,
} from "@/lib/cron/process-reviews";
import { notifyNewReview } from "@/lib/email/notify-new-review";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron diario contra Google Places API (New) v1.
 *
 * Vía de respaldo mientras esperamos la aprobación de cuota de Business
 * Profile API. Convive con `/api/cron/sync-google-reviews` — los dos
 * sincronizan reseñas a la misma tabla pero con `source` distinto.
 *
 * Schedule: configurar en vercel.json. Por defecto 0 10 * * * (1h después
 * del cron oficial para no solapar).
 *
 * Estrategia:
 *   1. Itera locations con `google_place_id` no null (no requiere oauth
 *      conectado — Places funciona sin OAuth).
 *   2. Lock optimista usando `oauth_last_sync_at` con ventana de 60s
 *      (compartido con el cron oficial; si uno está corriendo, el otro
 *      hace skip).
 *   3. Pide top-5 reseñas a Places API. Idempotente vía unique
 *      (location_id, google_review_id) — el prefijo "places:" evita
 *      colisiones con Business Profile.
 *   4. Pasa por el matcher como hace el cron oficial.
 *   5. Envío de notificaciones en batch al final con Promise.allSettled.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || !auth || !secretMatches(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient();

  const [locationsRes, salesRes] = await Promise.all([
    admin
      .from("locations")
      .select("id, name, google_place_id")
      .not("google_place_id", "is", null)
      .returns<{ id: string; name: string; google_place_id: string }[]>(),
    admin
      .from("profiles")
      .select("id, full_name, email, status")
      .eq("role", "sales")
      .returns<{ id: string; full_name: string; email: string | null; status: string }[]>(),
  ]);

  const locsErr = locationsRes.error;
  if (locsErr) {
    console.error("[cron-places] failed listing locations:", locsErr);
    return NextResponse.json({ error: locsErr.message }, { status: 500 });
  }

  const locations = locationsRes.data ?? [];
  const salesById = new Map<string, SalesInfo>();
  for (const s of salesRes.data ?? []) {
    salesById.set(s.id, { full_name: s.full_name, email: s.email, status: s.status });
  }
  const appBase =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  if (locations.length === 0) {
    return NextResponse.json({ ok: true, locations_processed: 0 });
  }

  const summary: LocationSummary[] = [];
  const allPending: PendingNotification[] = [];

  for (const loc of locations) {
    const entry: LocationSummary = {
      location_id: loc.id,
      location_name: loc.name,
      fetched: 0,
      new_reviews: 0,
      counted: 0,
      pending: 0,
      unmatched: 0,
    };

    // Mismo lock optimista que el cron oficial: si otro cron (oficial o
    // Places) procesó la location en los últimos 60s, hacemos skip. Atómico
    // en Postgres vía UPDATE con filtro temporal.
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
      const placesReviews = await listPlaceReviews(loc.google_place_id);
      entry.fetched = placesReviews.length;

      if (placesReviews.length === 0) {
        summary.push(entry);
        continue;
      }

      // Filtrar las que ya están en DB. Unique (location_id, google_review_id)
      // garantiza idempotencia, pero precheck evita el ruido del insert
      // duplicado y nos permite contar bien.
      const ids = placesReviews.map((r) => r.google_review_id);
      const { data: existing } = await admin
        .from("reviews")
        .select("google_review_id")
        .eq("location_id", loc.id)
        .in("google_review_id", ids)
        .returns<{ google_review_id: string }[]>();
      const existingSet = new Set((existing ?? []).map((r) => r.google_review_id));
      const fresh: FreshReview[] = placesReviews.filter(
        (r) => !existingSet.has(r.google_review_id),
      );

      if (fresh.length === 0) {
        summary.push(entry);
        continue;
      }

      const notifs = await processFreshReviews(
        {
          admin,
          location: { id: loc.id, name: loc.name },
          fresh,
          salesById,
          source: "places_api",
        },
        entry,
      );
      allPending.push(...notifs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof PlacesApiError ? err.code : undefined;
      console.error(`[cron-places] location ${loc.id} failed:`, msg, code ?? "");
      entry.error = code ? `${code}: ${msg}` : msg;
    }

    summary.push(entry);
  }

  const notifResult = await flushNotifications(admin, allPending, notifyNewReview, appBase);

  return NextResponse.json({
    ok: true,
    locations_processed: summary.length,
    notify_attempted: notifResult.attempted,
    notify_failed: notifResult.failed,
    summary,
  });
}

function secretMatches(authHeader: string, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}
