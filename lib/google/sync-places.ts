import "server-only";
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

/**
 * Orquestador del sync de reseñas vía Google Places API.
 *
 * Reutilizado por:
 *   - El cron diario `/api/cron/sync-places-reviews` (todas las fichas, sin
 *     filtro).
 *   - El cron horario externo (GitHub Action) llamando al mismo endpoint
 *     anterior.
 *   - El endpoint manual `/api/sync/now` con `locationIds` filtrado por rol:
 *     admin/gestor pasa null → todas; comercial pasa el id de su ficha
 *     asignada.
 *
 * Devuelve un resumen completo (locations + notif counts) para que el caller
 * lo pinte en su NextResponse. Nunca lanza — todos los errores quedan en el
 * `entry.error` de la location correspondiente.
 */

export type SyncPlacesArgs = {
  /** Si `null` o `undefined` → sincroniza todas las locations con
   *  `google_place_id` configurado. Si array → solo esas IDs (las que no
   *  existan o no tengan place_id se ignoran). */
  locationIds?: string[] | null;
};

export type SyncPlacesResult = {
  locations_processed: number;
  notify_attempted: number;
  notify_failed: number;
  summary: LocationSummary[];
};

export async function syncPlaces(args: SyncPlacesArgs = {}): Promise<SyncPlacesResult> {
  const admin = createServiceClient();
  const filter = args.locationIds ?? null;

  let locationsQuery = admin
    .from("locations")
    .select("id, name, google_place_id")
    .not("google_place_id", "is", null);
  if (filter && filter.length > 0) {
    locationsQuery = locationsQuery.in("id", filter);
  }

  const [locationsRes, salesRes] = await Promise.all([
    locationsQuery.returns<{ id: string; name: string; google_place_id: string }[]>(),
    admin
      .from("profiles")
      .select("id, full_name, email, status")
      .eq("role", "sales")
      .returns<{ id: string; full_name: string; email: string | null; status: string }[]>(),
  ]);

  if (locationsRes.error) {
    console.error("[sync-places] failed listing locations:", locationsRes.error);
    return {
      locations_processed: 0,
      notify_attempted: 0,
      notify_failed: 0,
      summary: [],
    };
  }

  const locations = locationsRes.data ?? [];
  const salesById = new Map<string, SalesInfo>();
  for (const s of salesRes.data ?? []) {
    salesById.set(s.id, { full_name: s.full_name, email: s.email, status: s.status });
  }
  const appBase =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  if (locations.length === 0) {
    return {
      locations_processed: 0,
      notify_attempted: 0,
      notify_failed: 0,
      summary: [],
    };
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

    // Lock optimista compartido con el cron de Business Profile. Si otro
    // proceso (cron horario, cron diario o sync manual) tocó esta location
    // en los últimos 60s, hacemos skip.
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

      // Filtrar las que ya están en DB.
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
      console.error(`[sync-places] location ${loc.id} failed:`, msg, code ?? "");
      entry.error = code ? `${code}: ${msg}` : msg;
    }

    summary.push(entry);
  }

  const notifResult = await flushNotifications(admin, allPending, notifyNewReview, appBase);

  return {
    locations_processed: summary.length,
    notify_attempted: notifResult.attempted,
    notify_failed: notifResult.failed,
    summary,
  };
}
