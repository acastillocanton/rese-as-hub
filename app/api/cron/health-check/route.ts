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
    lastRun,
    pendingCount,
    locations,
    recentUnmatchedCount,
    failedCount,
  ] = await Promise.all([
    loadLastHarvest(admin),
    countPendingDeepLinks(admin),
    loadLocations(admin),
    countRecentUnmatched(admin, recentCutoff),
    countFailedNotifications(admin),
  ]);

  const findings: HealthFinding[] = [];
  const harvest = checkHarvestStalled({ lastRun, pendingCount, nowMs });
  if (harvest) findings.push(harvest);
  findings.push(...checkLocationsSyncStale({ locations, nowMs }));
  const backlog = checkVerificationBacklog({ recentUnmatchedCount });
  if (backlog) findings.push(backlog);
  const failed = checkFailedNotifications({ failedCount });
  if (failed) findings.push(failed);

  const sorted = sortFindings(findings);
  const criticals = sorted.filter((f) => f.severity === "critical").length;

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      findings: sorted,
      inputs: { pendingCount, recentUnmatchedCount, failedCount, lastRun },
    });
  }

  await recordAudit({
    entityType: "location",
    entityId: SENTINEL,
    action: "health_check_run",
    payload: { findings: sorted.length, critical: criticals },
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

type ServiceClient = ReturnType<typeof createServiceClient>;

async function loadLastHarvest(admin: ServiceClient): Promise<HarvestHeartbeat> {
  const { data } = await admin
    .from("audit_log")
    .select("created_at, payload")
    .eq("action", "harvest_ran")
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<{ created_at: string; payload: { harvested?: number } | null }[]>();
  const row = data?.[0];
  if (!row) return null;
  return { createdAt: row.created_at, harvested: Number(row.payload?.harvested ?? 0) };
}

async function countPendingDeepLinks(admin: ServiceClient): Promise<number> {
  const { count } = await admin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .is("google_maps_url", null)
    .is("removed_at", null);
  return count ?? 0;
}

async function loadLocations(admin: ServiceClient): Promise<LocationSyncLite[]> {
  const { data } = await admin
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
  return (data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    oauthStatus: l.oauth_status,
    lastSyncAt: l.oauth_last_sync_at,
    lastSyncError: l.oauth_last_sync_error,
  }));
}

async function countRecentUnmatched(admin: ServiceClient, cutoffIso: string): Promise<number> {
  const { count } = await admin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("match_state", "unmatched")
    .is("removed_at", null)
    .gte("google_created_at", cutoffIso);
  return count ?? 0;
}

/** notify_failed (reseña) sin un notify_retry_ok posterior. Misma lógica que
 *  loadPending de /api/admin/notify-failed pero devolviendo solo el conteo. */
async function countFailedNotifications(admin: ServiceClient): Promise<number> {
  const { data: failed } = await admin
    .from("audit_log")
    .select("entity_id")
    .eq("entity_type", "review")
    .eq("action", "notify_failed")
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<{ entity_id: string }[]>();
  if (!failed || failed.length === 0) return 0;
  const reviewIds = failed.map((f) => f.entity_id);
  const { data: ok } = await admin
    .from("audit_log")
    .select("entity_id")
    .eq("entity_type", "review")
    .eq("action", "notify_retry_ok")
    .in("entity_id", reviewIds)
    .returns<{ entity_id: string }[]>();
  const okSet = new Set((ok ?? []).map((s) => s.entity_id));
  return new Set(failed.filter((f) => !okSet.has(f.entity_id)).map((f) => f.entity_id)).size;
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
