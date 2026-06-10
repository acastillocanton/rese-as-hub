import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseRange, commissionPeriodRange } from "@/lib/date-range";
import {
  buildSalesReport,
  buildSalesReportFilename,
  type SalesReportReview,
} from "@/lib/reports/sales-report";
import type { Role, SalesDepartment } from "@/lib/supabase/types";

/**
 * Excel propio de un comercial: cabecera (nombre, fecha incorporación,
 * zona, periodo, total) + tabla con sus reseñas `counted` no duplicadas
 * del rango.
 *
 * Query params:
 *   • from / to (yyyy-mm-dd, default mes en curso).
 *
 * Acceso:
 *   • admin, reviews_manager → cualquier sales_id.
 *   • office_director → solo self o un sales con `director_id = self`.
 *   • sales → solo self (autoservicio desde /panel/resenas).
 *
 * Las reseñas se cargan vía service-client porque el handler ya hace
 * gating en código (defensa en profundidad) y la RLS del director está
 * limitada a su equipo en `sales_id IN team`, lo que aquí ya cumplimos
 * con la validación previa.
 */

export const runtime = "nodejs";

const idSchema = z.string().uuid();

type ProfileRow = {
  id: string;
  full_name: string;
  joined_at: string | null;
  department: SalesDepartment | null;
  role: "sales" | "office_director";
  director_id: string | null;
  commission_rate: number | null;
  commission_cap: number | null;
  location: { name: string } | null;
};

type ReviewRow = {
  google_created_at: string;
  rating: number;
  author_name: string;
  client: { full_name: string } | null;
  location: { google_place_id: string | null } | null;
};

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const salesId = parsed.data;

  const url = new URL(request.url);
  const range = parseRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
    new Date(),
    commissionPeriodRange,
  );

  // Auth: leer rol del usuario actual con cookie-client.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: Role }>();
  const actorRole = actorProfile?.role ?? null;
  if (
    actorRole !== "admin" &&
    actorRole !== "reviews_manager" &&
    actorRole !== "office_director" &&
    actorRole !== "sales"
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Sales: solo puede exportar su propio Excel.
  if (actorRole === "sales" && salesId !== user.id) {
    return NextResponse.json({ error: "forbidden_scope" }, { status: 403 });
  }

  // Service-client desde aquí: la RLS del director sobre profiles está
  // scoped a su equipo, así que para resolver al destino con consistencia
  // (incluyendo el caso "soy yo mismo" para directores productores)
  // usamos service-role + validamos scope en código.
  const admin = createServiceClient();
  const { data: target } = await admin
    .from("profiles")
    .select(
      "id, full_name, joined_at, department, role, director_id, commission_rate, commission_cap, location:locations(name)",
    )
    .eq("id", salesId)
    .in("role", ["sales", "office_director"])
    .maybeSingle<ProfileRow>();
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Scope check para office_director: el destino debe ser self o un
  // sales con director_id = actor.userId.
  if (actorRole === "office_director") {
    const isSelf = target.id === user.id;
    const isTeamSales =
      target.role === "sales" && target.director_id === user.id;
    if (!isSelf && !isTeamSales) {
      return NextResponse.json({ error: "forbidden_scope" }, { status: 403 });
    }
  }

  // Reviews del comercial filtradas (anti-fraude mig 015):
  //   counted + no duplicada + no eliminada + en rango.
  const { data: reviewsRaw, error: reviewsErr } = await admin
    .from("reviews")
    .select(
      "google_created_at, rating, author_name, client:clients(full_name), location:locations(google_place_id)",
    )
    .eq("sales_id", salesId)
    .eq("match_state", "counted")
    .eq("is_duplicate", false)
    .is("removed_at", null)
    .gte("google_created_at", range.startIso)
    .lt("google_created_at", range.endIso)
    .order("google_created_at", { ascending: false })
    .returns<ReviewRow[]>();

  if (reviewsErr) {
    console.error("[export/sales] reviews query failed:", reviewsErr);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const reviews: SalesReportReview[] = (reviewsRaw ?? []).map((r) => ({
    google_created_at: r.google_created_at,
    rating: r.rating,
    author_name: r.author_name,
    client_name: r.client?.full_name ?? null,
    place_id: r.location?.google_place_id ?? null,
  }));

  const buffer = await buildSalesReport({
    profile: {
      full_name: target.full_name,
      joined_at: target.joined_at,
      department: target.department,
      location_name: target.location?.name ?? null,
      role: target.role,
      commissionRate: target.commission_rate,
      commissionCap: target.commission_cap,
    },
    range,
    reviews,
  });

  const filename = buildSalesReportFilename(target.full_name, range);
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
