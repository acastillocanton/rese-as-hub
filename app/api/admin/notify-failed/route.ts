import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyNewReview } from "@/lib/email/notify-new-review";
import { DEFAULT_BRAND } from "@/lib/branding";
import type { Brand } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Admin-only: lista las notificaciones de reseñas que fallaron al enviar
 * por email y permite reintentarlas a mano.
 *
 *   GET  /api/admin/notify-failed
 *     → lista los notify_failed pendientes (sin reintento exitoso posterior)
 *
 *   POST /api/admin/notify-failed
 *     body: { ids?: string[] }  // audit_log.id; si vacío, reintenta todos
 *     → reenvía y registra resultado (notify_retry_ok | notify_retry_failed)
 *
 * Acceso: cookie de sesión admin (RLS audit_log_admin_select + check en
 * código). Sin admin → 403.
 */

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" as const, status: 401 };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (profile?.role !== "admin") {
    return { error: "forbidden" as const, status: 403 };
  }
  return { ok: true as const };
}

type FailedRow = {
  id: string;
  entity_id: string;
  created_at: string;
  payload: {
    sales_id?: string;
    sales_email?: string;
    google_review_id?: string;
    error?: string;
    status?: number;
  };
};

async function loadPending(): Promise<FailedRow[]> {
  const admin = createServiceClient();
  // notify_failed que no tiene un notify_retry_ok posterior para la misma
  // review (entity_id). Lo hacemos en dos queries por simplicidad.
  const { data: failed } = await admin
    .from("audit_log")
    .select("id, entity_id, created_at, payload")
    .eq("entity_type", "review")
    .eq("action", "notify_failed")
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<FailedRow[]>();
  if (!failed || failed.length === 0) return [];

  const reviewIds = failed.map((f) => f.entity_id);
  const { data: succeeded } = await admin
    .from("audit_log")
    .select("entity_id")
    .eq("entity_type", "review")
    .eq("action", "notify_retry_ok")
    .in("entity_id", reviewIds)
    .returns<{ entity_id: string }[]>();
  const okSet = new Set((succeeded ?? []).map((s) => s.entity_id));

  return failed.filter((f) => !okSet.has(f.entity_id));
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const pending = await loadPending();
  return NextResponse.json({ ok: true, pending });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let ids: string[] | undefined;
  try {
    const body = await request.json();
    if (Array.isArray(body?.ids)) ids = body.ids as string[];
  } catch {
    // body vacío o no-JSON → reintentar todos
  }

  const pending = await loadPending();
  const targets = ids ? pending.filter((p) => ids!.includes(p.id)) : pending;
  if (targets.length === 0) {
    return NextResponse.json({ ok: true, retried: 0, succeeded: 0, failed: 0 });
  }

  const admin = createServiceClient();
  const appBase =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  // Cargamos en paralelo los datos necesarios para reconstruir cada email.
  const reviewIds = targets.map((t) => t.entity_id);
  const { data: reviews } = await admin
    .from("reviews")
    .select(
      "id, author_name, rating, text, match_confidence, sales_id, sales:profiles!reviews_sales_id_fkey(full_name, email, status), location:locations(name, brand), client:clients(full_name)",
    )
    .in("id", reviewIds)
    .is("removed_at", null)
    .returns<
      Array<{
        id: string;
        author_name: string;
        rating: number;
        text: string | null;
        match_confidence: number;
        sales_id: string | null;
        sales: { full_name: string; email: string | null; status: string } | null;
        location: { name: string; brand: Brand } | null;
        client: { full_name: string } | null;
      }>
    >();

  const reviewById = new Map((reviews ?? []).map((r) => [r.id, r] as const));

  const sendResults = await Promise.allSettled(
    targets.map((t) => {
      const r = reviewById.get(t.entity_id);
      if (!r || !r.sales?.email || r.sales.status !== "active") {
        return Promise.resolve({ ok: false, error: "sales_not_eligible" } as const);
      }
      return notifyNewReview({
        salesEmail: r.sales.email,
        salesName: r.sales.full_name,
        rating: r.rating,
        reviewText: r.text,
        authorName: r.author_name,
        clientFullName: r.client?.full_name ?? null,
        locationName: r.location?.name ?? null,
        matchConfidence: r.match_confidence,
        brand: r.location?.brand ?? DEFAULT_BRAND,
        appBase,
      });
    }),
  );

  let succeeded = 0;
  let failed = 0;
  const auditRows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const r = sendResults[i];
    if (!t || !r) continue;
    const reviewId = t.entity_id;

    if (r.status === "rejected") {
      failed++;
      auditRows.push({
        entity_type: "review",
        entity_id: reviewId,
        action: "notify_retry_failed",
        payload: {
          retry_of: t.id,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        },
      });
      continue;
    }
    const sendRes = r.value;
    if (sendRes.ok || ("skipped" in sendRes && sendRes.skipped)) {
      succeeded++;
      auditRows.push({
        entity_type: "review",
        entity_id: reviewId,
        action: "notify_retry_ok",
        payload: { retry_of: t.id, skipped: "skipped" in sendRes && sendRes.skipped },
      });
    } else {
      failed++;
      auditRows.push({
        entity_type: "review",
        entity_id: reviewId,
        action: "notify_retry_failed",
        payload: {
          retry_of: t.id,
          status: "status" in sendRes ? sendRes.status : null,
          error: "error" in sendRes ? sendRes.error : null,
        },
      });
    }
  }

  if (auditRows.length > 0) {
    await admin.from("audit_log").insert(auditRows as never);
  }

  return NextResponse.json({
    ok: true,
    retried: targets.length,
    succeeded,
    failed,
  });
}
