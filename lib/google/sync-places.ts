import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { listPlaceReviews, PlacesApiError, type PlacesReview } from "@/lib/google/places";
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
  removed: number;
  restored: number;
  summary: LocationSummary[];
};

/**
 * Lógica de detección de reseñas eliminadas en Google.
 *
 * Places API legacy con reviews_sort=newest devuelve siempre las 5 más
 * recientes. Si una reseña que YA teníamos en BD dentro de la ventana
 * temporal cubierta por las 5 nuevas deja de aparecer, significa que el
 * cliente la borró o Google la quitó.
 *
 * La "ventana temporal" se calcula como `[fecha_más_antigua_de_las_5, ∞)`.
 * Cualquier reseña en BD con `google_created_at >= esa fecha` que NO esté
 * en la respuesta de Places se marca con `removed_at = now()`.
 *
 * Casos cubiertos:
 *   - Cliente borra una reseña reciente → marca como removed.
 *   - Reseña restaurada (Google la vuelve a mostrar) → restore (removed_at = null).
 *   - Reseña importada manualmente → ignorada (google_review_id empieza
 *     por 'manual:', nunca aparece en Places por definición).
 *   - Sin reseñas en Places (fetched=0) → no tocamos nada (la ficha podría
 *     no tener historial accesible; no asumimos que todo está borrado).
 *
 * Devuelve { removed, restored } para incluir en el summary del cron.
 */
async function reconcileRemoved(
  admin: ReturnType<typeof createServiceClient>,
  locationId: string,
  placesReviews: PlacesReview[],
): Promise<{ removed: number; restored: number }> {
  if (placesReviews.length === 0) {
    return { removed: 0, restored: 0 };
  }
  const idsFromGoogle = new Set(placesReviews.map((r) => r.google_review_id));
  const oldestMs = placesReviews
    .map((r) => new Date(r.google_created_at).getTime())
    .reduce((min, t) => Math.min(min, t), Number.POSITIVE_INFINITY);
  const windowStart = new Date(oldestMs).toISOString();

  // Reseñas en BD dentro de la ventana cubierta por las 5 que devuelve
  // Places. Solo evaluamos las que provienen de Places (las manuales y
  // futuras de Business Profile las ignoramos — la API de Places no las
  // conoce). Filtrar por prefijo `places:` es la forma segura.
  const { data: candidates } = await admin
    .from("reviews")
    .select("id, google_review_id, removed_at")
    .eq("location_id", locationId)
    .like("google_review_id", "places:%")
    .gte("google_created_at", windowStart)
    .returns<{ id: string; google_review_id: string; removed_at: string | null }[]>();

  if (!candidates || candidates.length === 0) {
    return { removed: 0, restored: 0 };
  }

  const toRemove: string[] = [];
  const toRestore: string[] = [];
  for (const r of candidates) {
    const stillInGoogle = idsFromGoogle.has(r.google_review_id);
    if (stillInGoogle && r.removed_at !== null) {
      toRestore.push(r.id);
    } else if (!stillInGoogle && r.removed_at === null) {
      toRemove.push(r.id);
    }
  }

  if (toRemove.length > 0) {
    await admin
      .from("reviews")
      .update({ removed_at: new Date().toISOString() } as never)
      .in("id", toRemove);
  }
  if (toRestore.length > 0) {
    await admin
      .from("reviews")
      .update({ removed_at: null } as never)
      .in("id", toRestore);
  }

  return { removed: toRemove.length, restored: toRestore.length };
}

/** Exportación interna para tests unitarios. NO usar en código de producción
 *  — el orquestador es `syncPlaces`. */
export const __test_reconcileRemoved = reconcileRemoved;

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
      removed: 0,
      restored: 0,
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
      removed: 0,
      restored: 0,
      summary: [],
    };
  }

  const summary: LocationSummary[] = [];
  const allPending: PendingNotification[] = [];
  let totalRemoved = 0;
  let totalRestored = 0;

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

      // Detectar eliminaciones/restauraciones DENTRO de la ventana temporal
      // cubierta por las 5 que Google devuelve.
      const reconciled = await reconcileRemoved(admin, loc.id, placesReviews);
      totalRemoved += reconciled.removed;
      totalRestored += reconciled.restored;

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
    removed: totalRemoved,
    restored: totalRestored,
    summary,
  };
}
