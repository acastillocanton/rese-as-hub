import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getValidAccessTokenForLocation,
  isOAuthAuthError,
  listReviews,
  starRatingToInt,
  type GoogleReview,
} from "@/lib/google/business-profile";
import { stripGoogleTranslation } from "@/lib/google/strip-translation";
import { normalizeOwnerReply } from "@/lib/google/owner-reply";
import { decideBpEditSync } from "@/lib/cron/edit-merge";
import { decideReconcileRemoved } from "@/lib/cron/reconcile-removed";
import { addCrossLocationToRosters } from "@/lib/cron/cross-location-roster";
import {
  processFreshReviews,
  flushNotifications,
  flushLowRatingAlerts,
  type LocationSummary,
  type SalesInfo,
  type FreshReview,
  type PendingNotification,
  type LowRatingAlertContext,
  type CommercialInfo,
} from "@/lib/cron/process-reviews";
import {
  resolveLowRatingRecipients,
  type LowRatingAlert,
} from "@/lib/cron/low-rating-alerts";
import { notifyNewReview } from "@/lib/email/notify-new-review";
import { notifyLowRating } from "@/lib/email/notify-low-rating";
import type { Brand, ProfileStatus } from "@/lib/supabase/types";

/**
 * Orquestador del sync de reseñas vía Google Business Profile API (v4).
 *
 * Fuente ÚNICA de reseñas going-forward desde 2026-06-10 (§4.50). Reutilizado por:
 *   - El cron `/api/cron/sync-google-reviews` (horario vía GitHub Action +
 *     diario de respaldo en vercel.json), todas las fichas conectadas, sin filtro.
 *   - El endpoint manual `/api/sync/now` con `locationIds` filtrado por rol:
 *     admin/gestor sin body → todas; con location_id → solo esa; comercial/director
 *     → la de su ficha.
 *
 * Nunca lanza — los errores quedan en el `entry.error` de la location
 * correspondiente (mismo contrato que `syncPlaces`), para que el caller pinte
 * un NextResponse JSON sin romperse.
 *
 * (Antes esta lógica vivía inline en el GET del cron; se extrajo a este módulo
 * para que el sync manual use BP en lugar de Places — apagado el 2026-06-10.)
 */

/**
 * Fecha de activación de Business Profile como fuente (caso 5-5855000041022,
 * cuota concedida 2026-06-10). Decisión de producto: "solo de ahora en
 * adelante" — NO importamos el histórico de Google (Oropesa tiene 1.622
 * reseñas) para no inflar la bandeja de unmatched ni disparar una tormenta
 * de alertas ≤2★ por reseñas viejas. Solo se insertan reseñas con
 * createTime >= este corte. Ver CLAUDE.md §4.26 / §4.50.
 */
export const BP_GO_LIVE_AT = "2026-06-10T00:00:00.000Z";

/**
 * Soft-delete AUTOMÁTICO desactivado (2026-06-17). El reconcile (`reconcileRemovedBp`,
 * mig 028, §4.20) marcó 5 reseñas `counted` legítimas de comerciales (5★, no
 * duplicadas) como eliminadas en days 06-14..06-16 — falsos positivos. Causa:
 * la API v4 de Business Profile NO devuelve un snapshot estable/completo del feed
 * (omite reseñas intermitentemente entre llamadas), así que el "invariante de
 * ventana" en el que se apoya el reconcile no se sostiene. Es la misma lección
 * que Places (§4.20). El umbral de 24h no basta: la ausencia puede sostenerse
 * varios runs por mala suerte. Decisión de producto: el soft-delete vuelve a ser
 * SOLO MANUAL (estado pre-mig-028). El código del reconcile se conserva, inerte,
 * por si en el futuro se diseña una detección robusta (p.ej. exigir un fetch
 * paginado completo + ausencia sostenida de N días). No borrar `missing_since`
 * (mig 028) — queda como columna durmiente.
 */
export const AUTO_REMOVE_ENABLED = false;

/**
 * Presupuesto de tiempo del loop de fichas. El caller corre en lambdas de
 * Vercel con maxDuration=60s (tope Hobby): si al ir a empezar una ficha ya
 * hemos consumido este presupuesto, se salta con `skipped_time_budget` y la
 * recoge el siguiente run (idempotente + lock optimista → seguro). Devolver
 * 200 con resultado parcial es mejor que un 504 que no reporta nada. El margen
 * restante (~15s) cubre el flush de notificaciones/alertas del final.
 */
const SYNC_TIME_BUDGET_MS = 45_000;

export type SyncBusinessProfileArgs = {
  /** Si `null`/`undefined` → todas las fichas conectadas (oauth_status=connected
   *  con google_location_resource). Si array → solo esas IDs (las que no estén
   *  conectadas se ignoran). */
  locationIds?: string[] | null;
};

export type SyncBusinessProfileResult = {
  locations_processed: number;
  notify_attempted: number;
  notify_failed: number;
  low_rating_alerts_attempted: number;
  low_rating_alerts_failed: number;
  low_rating_alerts_skipped: number;
  summary: LocationSummary[];
};

export async function syncBusinessProfile(
  args: SyncBusinessProfileArgs = {},
): Promise<SyncBusinessProfileResult> {
  const startedAt = Date.now();
  const admin = createServiceClient();
  const filter = args.locationIds ?? null;

  let locationsQuery = admin
    .from("locations")
    .select("id, name, google_location_resource, google_place_id, brand")
    .eq("oauth_status", "connected")
    .not("google_location_resource", "is", null);
  if (filter && filter.length > 0) {
    locationsQuery = locationsQuery.in("id", filter);
  }

  // Cargamos en paralelo: locations conectadas + sales + admins + managers
  // (los dos últimos para alertas ≤2★ multi-stakeholder).
  const [locationsRes, salesRes, adminsRes, managersRes] = await Promise.all([
    locationsQuery.returns<{
      id: string;
      name: string;
      google_location_resource: string;
      google_place_id: string | null;
      brand: Brand;
    }[]>(),
    admin
      .from("profiles")
      .select("id, full_name, email, status, director_id, location_id, cross_location, role")
      .in("role", ["sales", "office_director"])
      .returns<{
        id: string;
        full_name: string;
        email: string | null;
        status: string;
        director_id: string | null;
        location_id: string | null;
        cross_location: boolean;
        role: "sales" | "office_director";
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

  if (locationsRes.error) {
    console.error(
      "[sync-bp] failed listing connected locations:",
      locationsRes.error,
    );
    return emptyResult();
  }

  const connectedLocations = locationsRes.data ?? [];
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
  // Roster de comerciales NO archivados por ficha — para el rescate por
  // mención del matcher (comercial nombrado en el texto sin enlace en ventana).
  const commercialsByLocation = new Map<string, CommercialInfo[]>();
  for (const s of salesRes.data ?? []) {
    if (!s.location_id || s.status === "archived") continue;
    const arr = commercialsByLocation.get(s.location_id) ?? [];
    arr.push({ sales_id: s.id, full_name: s.full_name, role: s.role });
    commercialsByLocation.set(s.location_id, arr);
  }
  // Comercial multi-oficina ("escrituradora", mig 031): no tiene location_id
  // fija, así que el loop de arriba lo salta. Lo añadimos al roster de CADA
  // ficha donde tiene algún cliente, para que el rescate por mención (§4.38)
  // funcione en ellas (atribución por nombre/tiempo ya va vía share_links).
  await addCrossLocationToRosters(admin, salesRes.data ?? [], commercialsByLocation);
  const appBase =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  if (connectedLocations.length === 0) {
    return emptyResult();
  }

  const summary: LocationSummary[] = [];

  // Mapa brand por location para el flush de alertas ≤2★.
  const brandByLocationId = new Map<string, Brand>();
  for (const l of connectedLocations) {
    brandByLocationId.set(l.id, l.brand);
  }

  // Acumulamos las notificaciones de TODAS las locations y las enviamos en
  // paralelo al final (Promise.allSettled), para no exceder los 60s de Vercel.
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

    // Presupuesto de tiempo (ver SYNC_TIME_BUDGET_MS): va ANTES del lock para
    // no bloquear al siguiente run sobre una ficha que no vamos a procesar.
    if (Date.now() - startedAt > SYNC_TIME_BUDGET_MS) {
      entry.error = "skipped_time_budget";
      summary.push(entry);
      continue;
    }

    // Lock optimista contra solapamiento: si otro proceso (cron horario, cron
    // diario o sync manual) tocó esta location en los últimos 60s, hacemos skip.
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

        // Going-forward only (§4.26): la API ordena por updateTime desc. Si la
        // página ENTERA es anterior al corte de activación, ya hemos pasado la
        // ventana de reseñas recientes y las páginas siguientes son aún más
        // antiguas → dejamos de paginar hacia el histórico (no lo importamos).
        if (pageReviews.every((r) => r.createTime < BP_GO_LIVE_AT)) break;

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

      // Caso B (§4.48): respuestas del propietario añadidas DESPUÉS en Google a
      // reseñas que ya teníamos. El caso dominante tiene cero reseñas fresh
      // (una reseña vieja a la que responden días más tarde), así que esto va
      // ANTES del filtro `fresh` y del early-return de abajo.
      await syncExistingReplies(admin, loc.id, googleReviews, existingSet);

      // Ediciones (§4.41 variante BP): el reviewId es estable, así que una
      // reseña editada en Google (rating/texto) NUNCA entra como fresh — hay
      // que actualizar la fila in-place. Igual que las replies, va antes del
      // early-return (el caso típico no trae ninguna fresh).
      const editRes = await syncExistingEdits(admin, loc, googleReviews, existingSet);
      if (editRes.edited > 0) entry.edited = editRes.edited;
      lowRatingAlerts.push(...editRes.alerts);
      for (const a of editRes.alerts) {
        if (a.clientId) clientIdsSeen.add(a.clientId);
      }

      // Soft-delete automático DESACTIVADO (2026-06-17, ver AUTO_REMOVE_ENABLED):
      // generaba falsos positivos sobre reseñas counted legítimas porque la API
      // de Google no devuelve un feed estable. El soft-delete es ahora solo manual.
      // El reconcile se conserva inerte (try/catch propio: NO debe tumbar el sync).
      if (AUTO_REMOVE_ENABLED) {
        try {
          const autoRemoved = await reconcileRemovedBp(admin, loc.id, googleReviews);
          if (autoRemoved > 0) entry.auto_removed = autoRemoved;
        } catch (err) {
          console.error(
            `[sync-bp] reconcile removed failed for location ${loc.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      // Going-forward only (§4.26): además de filtrar las ya existentes,
      // descartamos las creadas ANTES del corte de activación.
      const fresh = googleReviews.filter(
        (r) => !existingSet.has(r.reviewId) && r.createTime >= BP_GO_LIVE_AT,
      );

      if (fresh.length === 0) {
        await markSyncOk(admin, loc.id);
        summary.push(entry);
        continue;
      }

      // Convertimos las reseñas de Google al shape común y delegamos en el
      // helper compartido (matcher + insert + notif).
      const freshNormalized: FreshReview[] = fresh.map((gr) => {
        const rawAuthor = gr.reviewer?.displayName?.trim() ?? "";
        const hasAuthorName = rawAuthor.length > 0;
        return {
          google_review_id: gr.reviewId,
          author_name: hasAuthorName ? rawAuthor : "Anónimo",
          hasAuthorName,
          rating: starRatingToInt(gr.starRating),
          // Google incrusta una traducción automática en el comment cuando el
          // idioma de la reseña ≠ locale de la cuenta. Guardamos solo el
          // original del cliente (§4.51).
          text: stripGoogleTranslation(gr.comment ?? null),
          google_created_at: gr.createTime,
          // §4.48: respuesta del propietario ya puesta directamente en Google.
          reply: normalizeOwnerReply(gr.reviewReply),
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
            commercials: commercialsByLocation.get(loc.id) ?? [],
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
      console.error(`[sync-bp] location ${loc.id} failed:`, msg);
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

  return {
    locations_processed: summary.length,
    notify_attempted: notifResult.attempted,
    notify_failed: notifResult.failed,
    low_rating_alerts_attempted: lowRatingResult.attempted,
    low_rating_alerts_failed: lowRatingResult.failed,
    low_rating_alerts_skipped: lowRatingResult.skipped,
    summary,
  };
}

function emptyResult(): SyncBusinessProfileResult {
  return {
    locations_processed: 0,
    notify_attempted: 0,
    notify_failed: 0,
    low_rating_alerts_attempted: 0,
    low_rating_alerts_failed: 0,
    low_rating_alerts_skipped: 0,
    summary: [],
  };
}

/**
 * Caso B de §4.48: sincroniza respuestas del propietario puestas DIRECTAMENTE en
 * Google a reseñas que ya teníamos en BD. El sync descarta las no-fresh, así que
 * sin esto nunca veríamos una respuesta añadida en Google después de importar la
 * reseña. Las saca de "Sin responder" con `reply_via='google_detected'`.
 *
 * Guarda anti-clobber (doble): el SELECT filtra `replied_at IS NULL` y el UPDATE
 * la re-asevera (race-safe contra una respuesta manual/API que aterrice entre
 * medias). NUNCA pisa un `manual` ni un `api` nuestro.
 */
async function syncExistingReplies(
  admin: ReturnType<typeof createServiceClient>,
  locationId: string,
  googleReviews: GoogleReview[],
  existingSet: Set<string>,
): Promise<number> {
  const withReply = googleReviews.filter(
    (gr) => existingSet.has(gr.reviewId) && gr.reviewReply,
  );
  if (withReply.length === 0) return 0;

  const byId = new Map(withReply.map((gr) => [gr.reviewId, gr.reviewReply!]));
  const ids = [...byId.keys()];

  const { data: pending } = await admin
    .from("reviews")
    .select("id, google_review_id")
    .eq("location_id", locationId)
    .in("google_review_id", ids)
    .is("replied_at", null)
    .returns<{ id: string; google_review_id: string }[]>();
  if (!pending || pending.length === 0) return 0;

  const now = new Date().toISOString();
  const auditRows: Record<string, unknown>[] = [];
  await Promise.all(
    pending.map(async (r) => {
      const rep = byId.get(r.google_review_id);
      const norm = normalizeOwnerReply(rep);
      if (!norm) return;
      const { error } = await admin
        .from("reviews")
        .update({
          reply_text: norm.text,
          replied_at: norm.repliedAt,
          reply_by: null,
          reply_via: "google_detected",
          reply_synced_at: now,
        } as never)
        .eq("id", r.id)
        .is("replied_at", null); // re-aseverada → race-safe
      if (!error) {
        auditRows.push({
          entity_type: "review",
          entity_id: r.id,
          action: "reply_google_detected",
          payload: {
            google_review_id: r.google_review_id,
            source: "business_profile",
            replied_at: norm.repliedAt,
            on_insert: false,
          },
        });
      }
    }),
  );
  if (auditRows.length > 0) {
    await admin.from("audit_log").insert(auditRows as never);
  }
  return auditRows.length;
}

/**
 * Ediciones de reseña en Google sobre filas que ya tenemos (§4.41, variante BP).
 *
 * Business Profile mantiene el `reviewId` estable cuando el autor EDITA su
 * reseña (p.ej. 1★→5★ tras hablar con el comercial — caso real de Cornel), así
 * que la edición jamás pasa el filtro de `fresh` y, sin esto, la BD se quedaría
 * con el rating/texto viejos (falseando medias y comisiones). En Places el
 * problema era el inverso (id sintético → fila fantasma) y lo resuelve la
 * fusión por autor de `process-reviews.ts`; aquí la fila ya está identificada.
 *
 * Semántica (espejo del merge de Places):
 *   - Solo toca `rating`, `text` y `fetched_at` — la atribución (sales_id,
 *     client_id, match_state, is_duplicate, evidencia) se PRESERVA intacta.
 *   - Si la fila estaba soft-deleted (`removed_at`), la edición la revive
 *     (demuestra que sigue existiendo en Google).
 *   - Si la edición baja a ≤2★ por primera vez, re-encola la alerta temprana
 *     (limpia `low_rating_alerted_at`; `flushLowRatingAlerts` lo re-sella).
 *   - Prefiltro por `updateTime !== createTime` (Google lo bumpea al editar;
 *     también al responder, pero esos casos caen a `skip` al comparar valores).
 *   - Idempotente: tras el UPDATE, el siguiente cron compara igual → skip.
 *
 * Audit: `action='review_edit_synced'` por fila actualizada.
 */
async function syncExistingEdits(
  admin: ReturnType<typeof createServiceClient>,
  loc: { id: string; name: string; google_place_id: string | null },
  googleReviews: GoogleReview[],
  existingSet: Set<string>,
): Promise<{ edited: number; alerts: LowRatingAlert[] }> {
  const candidates = googleReviews.filter(
    (gr) => existingSet.has(gr.reviewId) && gr.updateTime !== gr.createTime,
  );
  if (candidates.length === 0) return { edited: 0, alerts: [] };

  const byId = new Map(candidates.map((gr) => [gr.reviewId, gr]));
  const { data: stored } = await admin
    .from("reviews")
    .select(
      "id, google_review_id, author_name, rating, text, removed_at, low_rating_alerted_at, match_state, sales_id, client_id",
    )
    .eq("location_id", loc.id)
    .in("google_review_id", [...byId.keys()])
    .returns<
      {
        id: string;
        google_review_id: string;
        author_name: string;
        rating: number;
        text: string | null;
        removed_at: string | null;
        low_rating_alerted_at: string | null;
        match_state: "counted" | "pending" | "unmatched";
        sales_id: string | null;
        client_id: string | null;
      }[]
    >();
  if (!stored || stored.length === 0) return { edited: 0, alerts: [] };

  const now = new Date().toISOString();
  const alerts: LowRatingAlert[] = [];
  const auditRows: Record<string, unknown>[] = [];

  await Promise.all(
    stored.map(async (row) => {
      const gr = byId.get(row.google_review_id);
      if (!gr) return;
      const incomingRating = starRatingToInt(gr.starRating);
      const incomingText = stripGoogleTranslation(gr.comment ?? null);
      const decision = decideBpEditSync({
        stored: row,
        incomingRating,
        incomingText,
      });
      if (decision.action !== "update") return;

      const patch: Record<string, unknown> = {
        rating: incomingRating,
        text: incomingText,
        fetched_at: now,
      };
      if (decision.clearRemovedAt) patch.removed_at = null;
      if (decision.reAlertLowRating) patch.low_rating_alerted_at = null;

      const { error } = await admin
        .from("reviews")
        .update(patch as never)
        .eq("id", row.id);
      if (error) {
        console.error(`[sync-bp] edit sync failed for review ${row.id}:`, error);
        return;
      }

      auditRows.push({
        entity_type: "review",
        entity_id: row.id,
        action: "review_edit_synced",
        payload: {
          google_review_id: row.google_review_id,
          source: "business_profile",
          old_rating: row.rating,
          new_rating: incomingRating,
          text_changed: decision.textChanged,
          cleared_removed_at: decision.clearRemovedAt,
          re_alert_low_rating: decision.reAlertLowRating,
        },
      });

      if (decision.reAlertLowRating) {
        alerts.push({
          reviewId: row.id,
          rating: incomingRating,
          authorName: row.author_name,
          reviewText: incomingText,
          locationId: loc.id,
          locationName: loc.name,
          placeId: loc.google_place_id,
          matchState: row.match_state,
          salesId: row.sales_id,
          clientId: row.client_id,
        });
      }
    }),
  );

  if (auditRows.length > 0) {
    await admin.from("audit_log").insert(auditRows as never);
  }
  return { edited: auditRows.length, alerts };
}

/**
 * Soft-delete automático de reseñas borradas en Google (§4.20, reactivado
 * 2026-06-11 — solo cron BP, las históricas de Places quedan fuera).
 *
 * Invariante de ventana: la API lista por `updateTime` desc y el fetch es un
 * prefijo de ese orden → contiene TODAS las reseñas con `updateTime >=
 * min(updateTime bajado)`. Como updateTime >= createTime, toda fila BP de BD
 * con `google_created_at > minFetchedUpdateTime` debería estar en el fetch.
 * Si no está, ha desaparecido de Google (autor la borró / Google la retiró).
 * Las filas más antiguas que la ventana NO son evaluables (no se tocan).
 *
 * Anti-falsos-positivos (la lección de Places, §4.20): primera ausencia →
 * sella `missing_since`; soft-delete (`removed_at`) solo tras 24h de ausencia
 * sostenida (≥ varios runs horarios); si reaparece, se limpia el sello. La
 * decisión vive en el helper puro `decideReconcileRemoved`. La restauración
 * sigue siendo manual (`restoreReview`, que limpia también `missing_since`
 * para dar gracia fresca); este flujo NUNCA limpia un removed_at.
 *
 * Audit: `action='review_auto_removed'` por fila soft-deleted.
 */
async function reconcileRemovedBp(
  admin: ReturnType<typeof createServiceClient>,
  locationId: string,
  googleReviews: GoogleReview[],
): Promise<number> {
  if (googleReviews.length === 0) return 0;

  let minFetchedUpdateTime = googleReviews[0]!.updateTime;
  for (const gr of googleReviews) {
    if (gr.updateTime < minFetchedUpdateTime) minFetchedUpdateTime = gr.updateTime;
  }
  const fetchedIds = new Set(googleReviews.map((gr) => gr.reviewId));

  const { data: candidates, error: candErr } = await admin
    .from("reviews")
    .select("id, google_review_id, missing_since")
    .eq("location_id", locationId)
    // `source` no está en los types hand-maintained de lib/supabase/types.ts
    // (añadirlo cuando ese archivo quede libre) — cast como en otros filtros.
    .eq("source" as string & keyof never, "business_profile")
    .is("removed_at", null)
    .gt("google_created_at", minFetchedUpdateTime)
    .returns<
      { id: string; google_review_id: string; missing_since: string | null }[]
    >();
  if (candErr) throw new Error(`reconcile candidates query failed: ${candErr.message}`);
  if (!candidates || candidates.length === 0) return 0;

  const now = new Date().toISOString();
  const decision = decideReconcileRemoved({
    candidates,
    fetchedIds,
    nowIso: now,
  });

  if (decision.reappeared.length > 0) {
    await admin
      .from("reviews")
      .update({ missing_since: null } as never)
      .in("id", decision.reappeared);
  }
  if (decision.firstMiss.length > 0) {
    await admin
      .from("reviews")
      .update({ missing_since: now } as never)
      .in("id", decision.firstMiss);
  }
  if (decision.toRemove.length > 0) {
    // `missing_since` se conserva como traza de cuándo desapareció.
    const { error: rmErr } = await admin
      .from("reviews")
      .update({ removed_at: now } as never)
      .in("id", decision.toRemove);
    if (rmErr) throw new Error(`reconcile remove update failed: ${rmErr.message}`);

    const byRowId = new Map(candidates.map((c) => [c.id, c]));
    await admin.from("audit_log").insert(
      decision.toRemove.map((id) => ({
        entity_type: "review",
        entity_id: id,
        action: "review_auto_removed",
        payload: {
          google_review_id: byRowId.get(id)?.google_review_id ?? null,
          missing_since: byRowId.get(id)?.missing_since ?? null,
          source: "business_profile",
        },
      })) as never,
    );
  }

  return decision.toRemove.length;
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
  // Si el fallo es de AUTENTICACIÓN (token caducado/revocado, sin token, scope
  // insuficiente) marcamos `oauth_status='error'`: así la ficha muestra "Error
  // OAuth" + botón "Reconectar" en /fichas (en vez de seguir en falso
  // "connected") y queda fuera del filtro `oauth_status='connected'` del sync
  // (no se machaca un token muerto cada hora). Un blip transitorio (5xx/429/red)
  // NO toca el estado. La vuelta a 'connected' la hace linkGoogleLocation al
  // reconectar. Ver CLAUDE.md §4.58.
  const update: Record<string, unknown> = {
    oauth_last_sync_at: new Date().toISOString(),
    oauth_last_sync_error: error.slice(0, 500),
  };
  if (isOAuthAuthError(error)) update.oauth_status = "error";
  await admin
    .from("locations")
    .update(update as never)
    .eq("id", locationId);
}
