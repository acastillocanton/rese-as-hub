import "server-only";

/**
 * Cosecha OFICIAL de deep-links de reseña (§4.54, Capa 1) — orquestación
 * canónica, compartida por el cron (/api/cron/enrich-review-urls) y el job
 * manual (jobs/enrich-review-urls-official.mjs reimplementa esto inline porque
 * es .mjs y no puede importar TS con alias; esta es la fuente de verdad).
 *
 * Places API (New) da `googleMapsUri` (deep-link oficial) de las ~5 reseñas
 * destacadas por ficha. Las casamos con nuestras filas pendientes
 * (`google_maps_url IS NULL`) por autor + rating + fecha, SOLO en match único
 * 1↔1 (matcher conservador `matchUgcToReviews`), y escribimos el deep-link.
 *
 * "Nunca lanza": acumula errores por ficha y devuelve un resumen, igual que
 * `syncBusinessProfile`. Idempotente y race-safe (`UPDATE … WHERE
 * google_maps_url IS NULL`).
 */

import { createServiceClient } from "@/lib/supabase/service";
import { listPlaceNewReviews } from "@/lib/google/places-new";
import {
  matchUgcToReviews,
  type StoredReviewForMatch,
  type UgcReviewForMatch,
} from "@/lib/google/maps-url-matching";

export type EnrichResult = {
  pendingReviews: number;
  processedLocations: number;
  featured: number;
  matched: number;
  errors: string[];
};

type PendingRow = {
  id: string;
  author_name: string;
  rating: number;
  google_created_at: string;
  location_id: string;
  location: { id: string; google_place_id: string | null } | null;
};

export async function enrichReviewMapsUrls(
  opts: { locationIds?: string[] } = {},
): Promise<EnrichResult> {
  const sb = createServiceClient();
  const result: EnrichResult = {
    pendingReviews: 0,
    processedLocations: 0,
    featured: 0,
    matched: 0,
    errors: [],
  };

  let query = sb
    .from("reviews")
    .select(
      "id, author_name, rating, google_created_at, location_id, location:locations(id, google_place_id)",
    )
    .is("google_maps_url", null)
    .is("removed_at", null)
    .limit(5000);
  if (opts.locationIds?.length) query = query.in("location_id", opts.locationIds);

  const { data: pending, error } = await query.returns<PendingRow[]>();
  if (error) {
    result.errors.push(`query_pending: ${error.message}`);
    return result;
  }
  if (!pending || pending.length === 0) return result;
  result.pendingReviews = pending.length;

  // Agrupar por ficha (necesitamos place_id para llamar a Places New).
  const byLoc = new Map<string, { placeId: string; rows: PendingRow[] }>();
  for (const r of pending) {
    const placeId = r.location?.google_place_id;
    if (!placeId) continue;
    const entry = byLoc.get(r.location_id);
    if (entry) entry.rows.push(r);
    else byLoc.set(r.location_id, { placeId, rows: [r] });
  }

  for (const [locationId, { placeId, rows }] of byLoc) {
    try {
      const featured = await listPlaceNewReviews(placeId);
      result.featured += featured.length;

      const stored: StoredReviewForMatch[] = rows.map((r) => ({
        id: r.id,
        authorName: r.author_name,
        rating: r.rating,
        createdAtIso: r.google_created_at,
      }));
      const ugc: UgcReviewForMatch[] = featured.map((f) => ({
        url: f.mapsUri,
        authorName: f.author,
        rating: f.rating,
        createdAtMs: f.publishTimeMs,
      }));

      const matches = matchUgcToReviews(stored, ugc).filter(
        (m): m is { reviewId: string; url: string; confidence: "exact" | "strong" } =>
          "url" in m,
      );

      let n = 0;
      for (const m of matches) {
        const { count } = await sb
          .from("reviews")
          .update(
            {
              google_maps_url: m.url,
              maps_url_matched_at: new Date().toISOString(),
            } as never,
            { count: "exact" },
          )
          .eq("id", m.reviewId)
          .is("google_maps_url", null); // race-safe
        if (count) n++;
      }
      if (n > 0) {
        await recordAuditSafe(locationId, {
          source: "places_new_official",
          matched: n,
          featured: featured.length,
          pending: rows.length,
        });
      }
      result.matched += n;
      result.processedLocations++;
    } catch (e) {
      result.errors.push(`${locationId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

/** Audit que no tumba el cron si falla (service-client, no lanza). */
async function recordAuditSafe(
  locationId: string,
  payload: Record<string, unknown>,
) {
  try {
    const sb = createServiceClient();
    await sb.from("audit_log").insert({
      entity_type: "location",
      entity_id: locationId,
      action: "review_maps_url_matched",
      payload,
    } as never);
  } catch {
    /* el audit es best-effort */
  }
}
