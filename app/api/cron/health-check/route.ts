import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/audit";
import { notifyHealthDigest } from "@/lib/email/notify-health";
import {
  checkFailedNotifications,
  checkHarvestStalled,
  checkLocationsSyncStale,
  checkVerificationBacklog,
  sortFindings,
  VERIFICATION_BACKLOG_WINDOW_DAYS,
  type HarvestHeartbeat,
  type HealthFinding,
  type LocationSyncLite,
} from "@/lib/monitoring/health-checks";

export const runtime = "nodejs";
export const maxDuration = 60;

const SENTINEL = "00000000-0000-0000-0000-000000000000";

/**
 * Chequeo de salud diario. Corre una batería de comprobaciones y, SOLO si
 * encuentra alguna incidencia, manda un email-resumen a los admins.
 *
 * Schedule en vercel.json: { "path": "/api/cron/health-check", "schedule": "45 5 * * *" }
 * (tras el sync BP de 05:05 y el enrich de 05:30 → ve el estado del día ya
 * actualizado). Protegido por CRON_SECRET (Bearer), igual que el resto de crons.
 *
 *   curl -H "Authorization: Bearer <CRON_SECRET>" \
 *     "http://localhost:3000/api/cron/health-check?dryRun=1"
 *
 * `?dryRun=1` devuelve los findings en JSON SIN enviar email (para verificar).
 *
 * Qué vigila: agente de deep-links parado/DOM roto · fichas sin sincronizar ·
 * backlog de huérfanas recientes · emails de notificación fallidos. NO toca
 * las alertas instantáneas ≤2★ (mig 017).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || !auth || !secretMatches(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const admin = createServiceClient();
  const nowMs = Date.now();
  const recentCutoff = new Date(
    nowMs - VERIFICATION_BACKLOG_WINDOW_DAYS * 86_400_000,
  ).toISOString();

  const [
    lastRunRes,
    pendingCountRes,
    locationsRes,
    recentUnmatchedCountRes,
    failedCountRes,
  ] = await Promise.all([
    loadLastHarvest(admin),
    countPendingDeepLinks(admin),
    loadLocations(admin),
    countRecentUnmatched(admin, recentCutoff),
    countFailedNotifications(admin),
  ]);

  // Si un cargador falla (blip transitorio de red/pooler), su chequeo se SALTA
  // en esta pasada (se reintenta mañana) en vez de evaluarse con un dato
  // fabricado: un lastRun null falso produce "no consta ejecución del agente"
  // (falso positivo 2026-08-26) y un count 0 falso SILENCIARÍA alertas reales.
  const loaderErrors: string[] = [];
  const findings: HealthFinding[] = [];

  if (lastRunRes.ok && pendingCountRes.ok) {
    const harvest = checkHarvestStalled({
      lastRun: lastRunRes.value,
      pendingCount: pendingCountRes.value,
      nowMs,
    });
    if (harvest) findings.push(harvest);
  } else {
    if (!lastRunRes.ok) loaderErrors.push(`lastHarvest: ${lastRunRes.error}`);
    if (!pendingCountRes.ok) loaderErrors.push(`pendingDeepLinks: ${pendingCountRes.error}`);
  }

  if (locationsRes.ok) {
    findings.push(...checkLocationsSyncStale({ locations: locationsRes.value, nowMs }));
  } else {
    loaderErrors.push(`locations: ${locationsRes.error}`);
  }

  if (recentUnmatchedCountRes.ok) {
    const backlog = checkVerificationBacklog({
      recentUnmatchedCount: recentUnmatchedCountRes.value,
    });
    if (backlog) findings.push(backlog);
  } else {
    loaderErrors.push(`recentUnmatched: ${recentUnmatchedCountRes.error}`);
  }

  if (failedCountRes.ok) {
    const failed = checkFailedNotifications({ failedCount: failedCountRes.value });
    if (failed) findings.push(failed);
  } else {
    loaderErrors.push(`failedNotifications: ${failedCountRes.error}`);
  }

  const sorted = sortFindings(findings);
  const criticals = sorted.filter((f) => f.severity === "critical").length;

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      findings: sorted,
      loaderErrors,
      inputs: {
        pendingCount: pendingCountRes.ok ? pendingCountRes.value : null,
        recentUnmatchedCount: recentUnmatchedCountRes.ok ? recentUnmatchedCountRes.value : null,
        failedCount: failedCountRes.ok ? failedCountRes.value : null,
        lastRun: lastRunRes.ok ? lastRunRes.value : null,
      },
    });
  }

  await recordAudit({
    entityType: "location",
    entityId: SENTINEL,
    action: "health_check_run",
    payload: {
      findings: sorted.length,
      critical: criticals,
      ...(loaderErrors.length > 0 ? { loader_errors: loaderErrors } : {}),
    },
  });

  let emailSent = false;
  if (sorted.length > 0) {
    const recipients = await loadAdminEmails(admin);
    const appBase =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
    const res = await notifyHealthDigest({ findings: sorted, to: recipients, appBase });
    emailSent = res.ok === true;
    await recordAudit({
      entityType: "location",
      entityId: SENTINEL,
      action: emailSent ? "health_alert_sent" : "health_alert_failed",
      payload: {
        findings: sorted.length,
        recipients: recipients.length,
        reason: res.ok ? null : "reason" in res ? res.reason : "error" in res ? res.error : null,
      },
    });
  }

  return NextResponse.json({ ok: true, findings: sorted.length, critical: criticals, emailSent });
}

function secretMatches(authHeader: string, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}

// ── Cargadores (service-client) ──
//
// Cada cargador distingue "la query falló" (ok:false → el chequeo se salta esa
// pasada) de "no hay filas" (ok:true con valor vacío/null → dato legítimo).
// Antes se destructuraba solo { data } y un error transitorio se confundía con
// "no hay latido" / "0 pendientes" (falso positivo del 2026-08-26).

type ServiceClient = ReturnType<typeof createServiceClient>;

type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

async function loadLastHarvest(admin: ServiceClient): Promise<Loaded<HarvestHeartbeat>> {
  const { data, error } = await admin
    .from("audit_log")
    .select("created_at, payload")
    .eq("action", "harvest_ran")
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<{ created_at: string; payload: { harvested?: number } | null }[]>();
  if (error) return { ok: false, error: error.message };
  const row = data?.[0];
  if (!row) return { ok: true, value: null };
  return {
    ok: true,
    value: { createdAt: row.created_at, harvested: Number(row.payload?.harvested ?? 0) },
  };
}

async function countPendingDeepLinks(admin: ServiceClient): Promise<Loaded<number>> {
  const { count, error } = await admin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .is("google_maps_url", null)
    .is("removed_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: count ?? 0 };
}

async function loadLocations(admin: ServiceClient): Promise<Loaded<LocationSyncLite[]>> {
  const { data, error } = await admin
    .from("locations")
    .select("id, name, oauth_status, oauth_last_sync_at, oauth_last_sync_error")
    .returns<
      Array<{
        id: string;
        name: string;
        oauth_status: string;
        oauth_last_sync_at: string | null;
        oauth_last_sync_error: string | null;
      }>
    >();
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    value: (data ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      oauthStatus: l.oauth_status,
      lastSyncAt: l.oauth_last_sync_at,
      lastSyncError: l.oauth_last_sync_error,
    })),
  };
}

async function countRecentUnmatched(
  admin: ServiceClient,
  cutoffIso: string,
): Promise<Loaded<number>> {
  const { count, error } = await admin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("match_state", "unmatched")
    .is("removed_at", null)
    .gte("google_created_at", cutoffIso);
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: count ?? 0 };
}

/** notify_failed (reseña) sin un notify_retry_ok posterior. Misma lógica que
 *  loadPending de /api/admin/notify-failed pero devolviendo solo el conteo. */
async function countFailedNotifications(admin: ServiceClient): Promise<Loaded<number>> {
  const { data: failed, error: failedError } = await admin
    .from("audit_log")
    .select("entity_id")
    .eq("entity_type", "review")
    .eq("action", "notify_failed")
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<{ entity_id: string }[]>();
  if (failedError) return { ok: false, error: failedError.message };
  if (!failed || failed.length === 0) return { ok: true, value: 0 };
  const reviewIds = failed.map((f) => f.entity_id);
  const { data: ok, error: okError } = await admin
    .from("audit_log")
    .select("entity_id")
    .eq("entity_type", "review")
    .eq("action", "notify_retry_ok")
    .in("entity_id", reviewIds)
    .returns<{ entity_id: string }[]>();
  if (okError) return { ok: false, error: okError.message };
  const okSet = new Set((ok ?? []).map((s) => s.entity_id));
  return {
    ok: true,
    value: new Set(failed.filter((f) => !okSet.has(f.entity_id)).map((f) => f.entity_id)).size,
  };
}

/** Emails de admins activos. Lee profiles.email con fallback a auth.users
 *  (algunos admins tienen email null en profiles — patrón de getResponderEmails). */
async function loadAdminEmails(admin: ServiceClient): Promise<string[]> {
  const { data } = await admin
    .from("profiles")
    .select("id, email")
    .eq("role", "admin")
    .eq("status", "active")
    .returns<{ id: string; email: string | null }[]>();
  if (!data || data.length === 0) return [];

  const emails: string[] = [];
  const missingIds: string[] = [];
  for (const p of data) {
    if (p.email) emails.push(p.email);
    else missingIds.push(p.id);
  }
  if (missingIds.length > 0) {
    const {
      data: { users },
    } = await admin.auth.admin.listUsers({ perPage: 100 });
    if (users) {
      const authMap = new Map(users.map((u) => [u.id, u.email]));
      for (const id of missingIds) {
        const e = authMap.get(id);
        if (e) emails.push(e);
      }
    }
  }
  // Dedupe case-insensitive.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const k = e.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(e.trim());
  }
  return out;
}
