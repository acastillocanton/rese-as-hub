import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRange } from "@/lib/date-range";
// Tipos de exceljs SOLO (import type) — no se incluye en el bundle.
import type ExcelJS from "exceljs";

// ExcelJS pesa ~500KB. Lo cargamos dinámicamente para que el chunk del
// resto de la app no lo incluya (este route es el único usuario).
async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default;
}

export const runtime = "nodejs";

/**
 * Genera un .xlsx con las reseñas que coinciden con los filtros aplicados.
 * Query params:
 *   - from: yyyy-mm-dd inclusive (default: día 1 del mes en curso)
 *   - to:   yyyy-mm-dd inclusive (default: último día del mes en curso)
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
  sales_id: string | null;
  location_id: string;
  sales: { full_name: string; slug: string } | null;
  client: { full_name: string } | null;
  location: { name: string } | null;
};

type ShareLinkRow = {
  sales_id: string;
  location_id: string;
  opened_at: string;
};

type SalesProfile = {
  id: string;
  full_name: string;
  monthly_goal: number;
  status: string;
};

type LocationLite = { id: string; name: string };

const MATCH_LABEL: Record<string, string> = {
  counted: "Atribuida automática",
  pending: "Pendiente verificar",
  unmatched: "Sin atribuir",
};

// Tonos para el dashboard (Hoja 2). Coherentes con la paleta del producto:
// crema, tinta oscura, acentos discretos.
const COLOR = {
  brand: "FF111111",
  cream: "FFF5F3EE",
  cream2: "FFEFEAD7",
  line: "FFE9E4D8",
  ink: "FF1A1A1A",
  ink2: "FF555555",
  ok: "FFD7EBD0", // verde pálido
  warn: "FFFBE7B5", // ámbar pálido
  bad: "FFF6D2CC", // rojo pálido
} as const;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const salesId = url.searchParams.get("sales_id");
  const locationId = url.searchParams.get("location_id");
  const matchState = url.searchParams.get("match_state");
  const range = parseRange(fromParam, toParam);

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

  // Límite defensivo para no timeout en Vercel (60s) ni saturar memoria al
  // generar el Excel. Si el rango pide más, el caller debería trocear (la UI
  // ofrece 3 atajos de máx 90 días, suficiente en la práctica).
  const REVIEWS_HARD_LIMIT = 5000;
  const SHARE_LINKS_HARD_LIMIT = 50000;

  let query = supabase
    .from("reviews")
    .select(
      "id, google_review_id, author_name, rating, text, google_created_at, match_state, match_confidence, sales_id, location_id, sales:profiles!reviews_sales_id_fkey(full_name, slug), client:clients(full_name), location:locations(name)",
    )
    .gte("google_created_at", range.startIso)
    .lt("google_created_at", range.endIso)
    .order("google_created_at", { ascending: true })
    .limit(REVIEWS_HARD_LIMIT);

  if (salesId) query = query.eq("sales_id", salesId);
  if (locationId) query = query.eq("location_id", locationId);
  if (matchState) query = query.eq("match_state", matchState);

  // En paralelo: share_links (para conversión), comerciales (para objetivos y
  // listar incluso a los que no tienen actividad pero están activos) y
  // fichas (para resolver nombres incluso si no aparecieron en reseñas).
  let shareLinksQuery = supabase
    .from("share_links")
    .select("sales_id, location_id, opened_at")
    .gte("opened_at", range.startIso)
    .lt("opened_at", range.endIso)
    .limit(SHARE_LINKS_HARD_LIMIT);
  if (salesId) shareLinksQuery = shareLinksQuery.eq("sales_id", salesId);
  if (locationId) shareLinksQuery = shareLinksQuery.eq("location_id", locationId);

  const [reviewsRes, shareLinksRes, salesRes, locationsRes] = await Promise.all([
    query.returns<ReviewRow[]>(),
    shareLinksQuery.returns<ShareLinkRow[]>(),
    supabase
      .from("profiles")
      .select("id, full_name, monthly_goal, status")
      .eq("role", "sales")
      .returns<SalesProfile[]>(),
    supabase.from("locations").select("id, name").order("name").returns<LocationLite[]>(),
  ]);
  const reviews = reviewsRes.data;
  const error = reviewsRes.error;
  const shareLinks = shareLinksRes.data ?? [];
  const allSales = salesRes.data ?? [];
  const allLocations = locationsRes.data ?? [];
  if (error) {
    console.error("[export/reviews] query failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ExcelJS = await loadExcelJS();
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

  // ─── Hoja 2 — Resumen (dashboard) ──────────────────────────────────────
  renderSummarySheet(workbook, {
    range,
    reviews: reviews ?? [],
    shareLinks,
    allSales,
    allLocations,
    filters: { salesId, locationId, matchState },
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `resenas-${range.slug}.xlsx`;

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

function renderSummarySheet(
  workbook: ExcelJS.Workbook,
  data: {
    range: ReturnType<typeof parseRange>;
    reviews: ReviewRow[];
    shareLinks: ShareLinkRow[];
    allSales: SalesProfile[];
    allLocations: LocationLite[];
    filters: { salesId: string | null; locationId: string | null; matchState: string | null };
  },
) {
  const { range, reviews, shareLinks, allSales, allLocations, filters } = data;

  const sheet = workbook.addWorksheet("Resumen");
  sheet.columns = [
    { key: "a", width: 28 },
    { key: "b", width: 16 },
    { key: "c", width: 16 },
    { key: "d", width: 16 },
    { key: "e", width: 16 },
    { key: "f", width: 16 },
  ];

  // ─── Cabecera ──────────────────────────────────────────────────────────
  sheet.mergeCells("A1:F1");
  const title = sheet.getCell("A1");
  title.value = "ReseñaHub · Parte de reseñas";
  title.font = { name: "Calibri", size: 18, bold: true, color: { argb: COLOR.brand } };
  title.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 28;

  sheet.mergeCells("A2:F2");
  const subtitle = sheet.getCell("A2");
  subtitle.value = `Periodo: ${range.label}`;
  subtitle.font = { name: "Calibri", size: 11, color: { argb: COLOR.ink2 } };

  if (filters.salesId || filters.locationId || filters.matchState) {
    sheet.mergeCells("A3:F3");
    const filtersCell = sheet.getCell("A3");
    const parts: string[] = [];
    if (filters.salesId) parts.push("comercial filtrado");
    if (filters.locationId) parts.push("ficha filtrada");
    if (filters.matchState) parts.push(`estado: ${MATCH_LABEL[filters.matchState] ?? filters.matchState}`);
    filtersCell.value = `Filtros aplicados: ${parts.join(" · ")}`;
    filtersCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: COLOR.ink2 } };
  }

  // ─── KPIs ──────────────────────────────────────────────────────────────
  const total = reviews.length;
  const counted = reviews.filter((r) => r.match_state === "counted").length;
  const pending = reviews.filter((r) => r.match_state === "pending").length;
  const unmatched = reviews.filter((r) => r.match_state === "unmatched").length;
  const avg = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  const totalVisits = shareLinks.length;
  const globalConv = totalVisits > 0 ? (counted / totalVisits) * 100 : null;

  const kpiRow = 5;
  drawKpi(sheet, "A", kpiRow, "Reseñas", String(total), `${counted} atribuidas · ${pending} pendientes`);
  drawKpi(sheet, "B", kpiRow, "Visitas al link", String(totalVisits), "share_links registrados");
  drawKpi(
    sheet,
    "C",
    kpiRow,
    "Conversión global",
    globalConv !== null ? `${globalConv.toFixed(1).replace(".", ",")}%` : "—",
    "atribuidas ÷ visitas",
  );
  drawKpi(
    sheet,
    "D",
    kpiRow,
    "Valoración media",
    total > 0 ? avg.toFixed(2).replace(".", ",") : "—",
    "sobre 5",
  );
  drawKpi(sheet, "E", kpiRow, "Sin atribuir", String(unmatched), "requieren revisión");

  // ─── Tabla Comerciales ─────────────────────────────────────────────────
  const visitsBySales = new Map<string, number>();
  for (const s of shareLinks) {
    visitsBySales.set(s.sales_id, (visitsBySales.get(s.sales_id) ?? 0) + 1);
  }
  const countedBySales = new Map<string, number>();
  for (const r of reviews) {
    if (r.match_state !== "counted" || !r.sales_id) continue;
    countedBySales.set(r.sales_id, (countedBySales.get(r.sales_id) ?? 0) + 1);
  }
  // Incluimos en la tabla a todos los comerciales activos + cualquiera con
  // actividad en el periodo (visitas o reseñas), aunque esté pausado: si tuvo
  // movimiento en el mes, debe aparecer.
  const salesIdsWithActivity = new Set<string>([
    ...visitsBySales.keys(),
    ...countedBySales.keys(),
  ]);
  const salesInTable = allSales.filter(
    (s) => s.status === "active" || salesIdsWithActivity.has(s.id),
  );

  const startRow = kpiRow + 4;
  sheet.mergeCells(`A${startRow}:F${startRow}`);
  const comTitle = sheet.getCell(`A${startRow}`);
  comTitle.value = "Comerciales";
  comTitle.font = { name: "Calibri", size: 13, bold: true, color: { argb: COLOR.brand } };

  const headerRow = startRow + 1;
  const headers = ["Comercial", "Visitas", "Reseñas", "Conversión", "Objetivo", "Cumplimiento"];
  headers.forEach((h, i) => {
    const col = String.fromCharCode("A".charCodeAt(0) + i);
    const c = sheet.getCell(`${col}${headerRow}`);
    c.value = h;
    c.font = { bold: true, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.cream } };
    c.border = { bottom: { style: "thin", color: { argb: COLOR.line } } };
    c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "right" };
  });

  const rows = salesInTable
    .map((s) => {
      const visits = visitsBySales.get(s.id) ?? 0;
      const cnt = countedBySales.get(s.id) ?? 0;
      const conversion = visits > 0 ? (cnt / visits) * 100 : null;
      const completion = s.monthly_goal > 0 ? (cnt / s.monthly_goal) * 100 : null;
      return { name: s.full_name, visits, counted: cnt, conversion, goal: s.monthly_goal, completion };
    })
    .sort((a, b) => b.counted - a.counted || b.visits - a.visits);

  if (rows.length === 0) {
    const r = sheet.getRow(headerRow + 1);
    r.getCell(1).value = "Sin comerciales con actividad en el periodo.";
    r.getCell(1).font = { italic: true, color: { argb: COLOR.ink2 } };
    sheet.mergeCells(`A${headerRow + 1}:F${headerRow + 1}`);
  } else {
    rows.forEach((row, idx) => {
      const rowIdx = headerRow + 1 + idx;
      const r = sheet.getRow(rowIdx);
      r.getCell(1).value = row.name;
      r.getCell(2).value = row.visits;
      r.getCell(3).value = row.counted;
      r.getCell(4).value = row.conversion !== null ? row.conversion / 100 : "—";
      r.getCell(5).value = row.goal;
      r.getCell(6).value = row.completion !== null ? row.completion / 100 : "—";

      r.getCell(1).alignment = { horizontal: "left" };
      for (let c = 2; c <= 6; c++) {
        r.getCell(c).alignment = { horizontal: "right" };
      }
      r.getCell(4).numFmt = "0.0%";
      r.getCell(6).numFmt = "0%";

      // Colorea cumplimiento: verde ≥100%, ámbar 60–100, rojo <60.
      if (row.completion !== null) {
        let bg: string | null = null;
        if (row.completion >= 100) bg = COLOR.ok;
        else if (row.completion >= 60) bg = COLOR.warn;
        else bg = COLOR.bad;
        if (bg) {
          r.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        }
      }
      // Borde inferior fino para legibilidad.
      for (let c = 1; c <= 6; c++) {
        r.getCell(c).border = { bottom: { style: "hair", color: { argb: COLOR.line } } };
      }
    });

    // Fila de totales
    const totalsRowIdx = headerRow + 1 + rows.length;
    const tr = sheet.getRow(totalsRowIdx);
    tr.getCell(1).value = "Total";
    tr.getCell(2).value = totalVisits;
    tr.getCell(3).value = counted;
    tr.getCell(4).value = globalConv !== null ? globalConv / 100 : "—";
    const totalGoal = rows.reduce((s, r) => s + r.goal, 0);
    tr.getCell(5).value = totalGoal;
    tr.getCell(6).value = totalGoal > 0 ? counted / totalGoal : "—";
    tr.getCell(4).numFmt = "0.0%";
    tr.getCell(6).numFmt = "0%";
    for (let c = 1; c <= 6; c++) {
      const cell = tr.getCell(c);
      cell.font = { bold: true };
      cell.alignment = { horizontal: c === 1 ? "left" : "right" };
      cell.border = {
        top: { style: "thin", color: { argb: COLOR.line } },
        bottom: { style: "thin", color: { argb: COLOR.line } },
      };
    }
  }

  // ─── Tabla Fichas ──────────────────────────────────────────────────────
  const fichasStart = (rows.length === 0 ? headerRow + 2 : headerRow + 2 + rows.length) + 2;
  sheet.mergeCells(`A${fichasStart}:F${fichasStart}`);
  const locTitle = sheet.getCell(`A${fichasStart}`);
  locTitle.value = "Fichas";
  locTitle.font = { name: "Calibri", size: 13, bold: true, color: { argb: COLOR.brand } };

  const locHeaderRow = fichasStart + 1;
  ["Ficha", "Reseñas", "Atribuidas", "Valoración media"].forEach((h, i) => {
    const col = String.fromCharCode("A".charCodeAt(0) + i);
    const c = sheet.getCell(`${col}${locHeaderRow}`);
    c.value = h;
    c.font = { bold: true, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.cream } };
    c.border = { bottom: { style: "thin", color: { argb: COLOR.line } } };
    c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "right" };
  });

  const reviewsByLocation = new Map<string, ReviewRow[]>();
  for (const r of reviews) {
    const arr = reviewsByLocation.get(r.location_id) ?? [];
    arr.push(r);
    reviewsByLocation.set(r.location_id, arr);
  }
  const fichasRows = allLocations
    .map((l) => {
      const rs = reviewsByLocation.get(l.id) ?? [];
      const cnt = rs.filter((r) => r.match_state === "counted").length;
      const avgLoc = rs.length > 0 ? rs.reduce((s, r) => s + r.rating, 0) / rs.length : null;
      return { name: l.name, total: rs.length, counted: cnt, avg: avgLoc };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);

  if (fichasRows.length === 0) {
    const r = sheet.getRow(locHeaderRow + 1);
    r.getCell(1).value = "Sin reseñas en el periodo.";
    r.getCell(1).font = { italic: true, color: { argb: COLOR.ink2 } };
    sheet.mergeCells(`A${locHeaderRow + 1}:F${locHeaderRow + 1}`);
  } else {
    fichasRows.forEach((row, idx) => {
      const rowIdx = locHeaderRow + 1 + idx;
      const r = sheet.getRow(rowIdx);
      r.getCell(1).value = row.name;
      r.getCell(2).value = row.total;
      r.getCell(3).value = row.counted;
      r.getCell(4).value = row.avg !== null ? Number(row.avg.toFixed(2)) : "—";
      r.getCell(1).alignment = { horizontal: "left" };
      for (let c = 2; c <= 4; c++) {
        r.getCell(c).alignment = { horizontal: "right" };
        r.getCell(c).border = { bottom: { style: "hair", color: { argb: COLOR.line } } };
      }
      r.getCell(1).border = { bottom: { style: "hair", color: { argb: COLOR.line } } };
    });
  }

  // ─── Pie ───────────────────────────────────────────────────────────────
  const lastFichaRow = fichasRows.length === 0 ? locHeaderRow + 1 : locHeaderRow + fichasRows.length;
  const footRow = lastFichaRow + 2;
  sheet.mergeCells(`A${footRow}:F${footRow}`);
  const foot = sheet.getCell(`A${footRow}`);
  foot.value = `Generado el ${new Date().toLocaleString("es-ES")} · ReseñaHub · Inseryal by Marina d'Or`;
  foot.font = { italic: true, size: 9.5, color: { argb: COLOR.ink2 } };
}

function drawKpi(
  sheet: ExcelJS.Worksheet,
  col: string,
  row: number,
  label: string,
  value: string,
  sub: string,
) {
  const labelCell = sheet.getCell(`${col}${row}`);
  labelCell.value = label;
  labelCell.font = { size: 9, bold: true, color: { argb: COLOR.ink2 } };
  labelCell.alignment = { vertical: "middle" };

  const valueCell = sheet.getCell(`${col}${row + 1}`);
  valueCell.value = value;
  valueCell.font = { size: 18, bold: true, color: { argb: COLOR.brand } };
  valueCell.alignment = { vertical: "middle" };

  const subCell = sheet.getCell(`${col}${row + 2}`);
  subCell.value = sub;
  subCell.font = { size: 9, italic: true, color: { argb: COLOR.ink2 } };
  subCell.alignment = { vertical: "middle" };

  // Línea inferior discreta para separar visualmente del bloque siguiente.
  for (let offset = 0; offset < 3; offset++) {
    const c = sheet.getCell(`${col}${row + offset}`);
    c.border = c.border ?? {};
    if (offset === 2) {
      c.border = { bottom: { style: "hair", color: { argb: COLOR.line } } };
    }
  }
  sheet.getRow(row + 1).height = 26;
}
