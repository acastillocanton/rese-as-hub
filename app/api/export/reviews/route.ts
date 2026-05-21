import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Genera un .xlsx con las reseñas que coinciden con los filtros aplicados.
 * Acepta los mismos query params que /manager/resenas:
 *   - month: yyyy-mm (default: mes en curso)
 *   - sales_id: uuid (opcional)
 *   - location_id: uuid (opcional)
 *   - match_state: counted | pending | unmatched (opcional)
 *
 * Acceso: middleware permite /api/export/* a manager y admin.
 */
type ReviewRow = {
  id: string;
  google_review_id: string;
  author_name: string;
  rating: number;
  text: string | null;
  google_created_at: string;
  match_state: string;
  match_confidence: number;
  sales: { full_name: string; slug: string } | null;
  client: { full_name: string } | null;
  location: { name: string } | null;
};

const MONTH_LABELS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const MATCH_LABEL: Record<string, string> = {
  counted: "Atribuida automática",
  pending: "Pendiente verificar",
  unmatched: "Sin atribuir",
};

function monthRange(monthParam: string | null) {
  let year: number;
  let month: number;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m - 1;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
  }
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: `${MONTH_LABELS[month]} ${year}`,
    yearMonth: `${year}-${String(month + 1).padStart(2, "0")}`,
  };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");
  const salesId = url.searchParams.get("sales_id");
  const locationId = url.searchParams.get("location_id");
  const matchState = url.searchParams.get("match_state");
  const range = monthRange(monthParam);

  const supabase = await createClient();

  // Defensa en profundidad: solo manager o admin.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (profile?.role !== "admin" && profile?.role !== "reviews_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let query = supabase
    .from("reviews")
    .select(
      "id, google_review_id, author_name, rating, text, google_created_at, match_state, match_confidence, sales:profiles!reviews_sales_id_fkey(full_name, slug), client:clients(full_name), location:locations(name)",
    )
    .gte("google_created_at", range.start)
    .lt("google_created_at", range.end)
    .order("google_created_at", { ascending: true });

  if (salesId) query = query.eq("sales_id", salesId);
  if (locationId) query = query.eq("location_id", locationId);
  if (matchState) query = query.eq("match_state", matchState);

  const { data: reviews, error } = await query.returns<ReviewRow[]>();
  if (error) {
    console.error("[export/reviews] query failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ReseñaHub";
  workbook.created = new Date();

  // Hoja 1 — Reseñas
  const sheet = workbook.addWorksheet("Reseñas");
  sheet.columns = [
    { header: "Fecha", key: "fecha", width: 18 },
    { header: "Autor", key: "autor", width: 24 },
    { header: "Estrellas", key: "estrellas", width: 10 },
    { header: "Comentario", key: "comentario", width: 60 },
    { header: "Ficha", key: "ficha", width: 32 },
    { header: "Comercial", key: "comercial", width: 22 },
    { header: "Cliente atribuido", key: "cliente", width: 22 },
    { header: "Estado matching", key: "match", width: 22 },
    { header: "Confianza", key: "confianza", width: 12 },
    { header: "Google Review ID", key: "google_id", width: 36 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF5F3EE" },
  };
  sheet.getRow(1).alignment = { vertical: "middle" };

  for (const r of reviews ?? []) {
    sheet.addRow({
      fecha: new Date(r.google_created_at),
      autor: r.author_name,
      estrellas: r.rating,
      comentario: r.text ?? "",
      ficha: r.location?.name ?? "",
      comercial: r.sales?.full_name ?? "Sin atribuir",
      cliente: r.client?.full_name ?? "",
      match: MATCH_LABEL[r.match_state] ?? r.match_state,
      confianza: r.match_confidence,
      google_id: r.google_review_id,
    });
  }

  sheet.getColumn("fecha").numFmt = "dd/mm/yyyy hh:mm";
  sheet.getColumn("comentario").alignment = { wrapText: true, vertical: "top" };
  sheet.getColumn("estrellas").alignment = { horizontal: "center" };
  sheet.getColumn("confianza").alignment = { horizontal: "right" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  // Hoja 2 — Resumen
  const resumen = workbook.addWorksheet("Resumen");
  const total = reviews?.length ?? 0;
  const counted = (reviews ?? []).filter((r) => r.match_state === "counted").length;
  const pending = (reviews ?? []).filter((r) => r.match_state === "pending").length;
  const unmatched = (reviews ?? []).filter((r) => r.match_state === "unmatched").length;
  const avg =
    total > 0 ? (reviews ?? []).reduce((s, r) => s + r.rating, 0) / total : 0;

  const summaryRows: Array<[string, string | number]> = [
    ["Periodo", range.label],
    ["Filtro · Comercial", salesId ? salesId : "Todos"],
    ["Filtro · Ficha", locationId ? locationId : "Todas"],
    ["Filtro · Estado matching", matchState ? MATCH_LABEL[matchState] ?? matchState : "Todos"],
    ["", ""],
    ["Reseñas totales", total],
    ["Atribuidas (counted)", counted],
    ["Pendientes verificar", pending],
    ["Sin atribuir", unmatched],
    ["Valoración media", total > 0 ? Number(avg.toFixed(2)) : "—"],
    ["", ""],
    ["Generado el", new Date().toLocaleString("es-ES")],
    ["Fuente", "ReseñaHub · Inseryal by Marina d'Or"],
  ];
  resumen.columns = [
    { key: "campo", width: 32 },
    { key: "valor", width: 36 },
  ];
  for (const [campo, valor] of summaryRows) {
    const row = resumen.addRow({ campo, valor });
    if (campo === "Periodo" || campo === "Reseñas totales") {
      row.font = { bold: true };
    }
  }

  // Top comerciales por reseñas atribuidas (counted)
  const byCom = new Map<string, number>();
  for (const r of reviews ?? []) {
    if (r.match_state !== "counted" || !r.sales) continue;
    byCom.set(r.sales.full_name, (byCom.get(r.sales.full_name) ?? 0) + 1);
  }
  if (byCom.size > 0) {
    resumen.addRow({ campo: "", valor: "" });
    const titleRow = resumen.addRow({ campo: "Ranking comerciales (atribuidas)", valor: "" });
    titleRow.font = { bold: true };
    const sortedCom = [...byCom.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sortedCom) {
      resumen.addRow({ campo: name, valor: count });
    }
  }

  // Top fichas por reseñas
  const byLoc = new Map<string, number>();
  for (const r of reviews ?? []) {
    const name = r.location?.name;
    if (!name) continue;
    byLoc.set(name, (byLoc.get(name) ?? 0) + 1);
  }
  if (byLoc.size > 0) {
    resumen.addRow({ campo: "", valor: "" });
    const titleRow = resumen.addRow({ campo: "Ranking fichas", valor: "" });
    titleRow.font = { bold: true };
    const sortedLoc = [...byLoc.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sortedLoc) {
      resumen.addRow({ campo: name, valor: count });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `resenas-${range.yearMonth}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
