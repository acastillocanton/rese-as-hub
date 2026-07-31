import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRange, commissionPeriodRange } from "@/lib/date-range";
import type { PauseReason, SalesDepartment } from "@/lib/supabase/types";
import {
  DEPARTMENT_LABEL,
  DEPARTMENT_ORDER,
  archivedTotals,
  countedFor,
  formatLongSpanishDate,
  formatMonthHeader,
  formatRatingHeader,
  formatShortJoinedAt,
  formatUpperMonth,
  groupActiveSalesByDepartment,
  inlineNote,
  locationsForDepartment,
  type LocationForReport,
  type ReviewForReport,
  type SalesForReport,
} from "@/lib/reports/weekly-report";
import {
  jorgeReportMonths,
  jorgeZoneFor,
  type MonthRef,
} from "@/lib/reports/jorge-report";
import type ExcelJS from "exceljs";

async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default;
}

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Export "Informe Jorge". Reproduce el parte manual maquetado para imprimir en
 * A3, con 4 hojas departamentales (Nacional / Internacional / Castellón /
 * Valencia). A diferencia del parte de `/api/export/reviews`:
 *   - Sin hoja Detalle ni columnas de comisión.
 *   - Compara DOS meses naturales (mes del cierre del periodo + anterior).
 *   - Celdas amarillas (columna del mes actual, título del mes, fila total).
 *   - Nacional = lista única plana con una cabecera de valoración arriba.
 *
 * Acceso: SOLO admin + reviews_manager. El middleware deja pasar a
 * office_director en /api/export/*, así que el 403 se pone aquí en código.
 */

type SalesRow = {
  id: string;
  full_name: string;
  slug: string;
  status: "invited" | "active" | "paused" | "archived";
  joined_at: string;
  department: SalesDepartment | null;
  language: string | null;
  paused_reason: PauseReason | null;
  notes: string | null;
  location_id: string | null;
  role: "sales" | "office_director";
  location: { id: string; name: string } | null;
};

type LocationRow = {
  id: string;
  name: string;
  total_review_count: number | null;
  average_rating: number | null;
};

type ReviewRangeRow = {
  id: string;
  sales_id: string | null;
  location_id: string;
  match_state: "counted" | "pending" | "unmatched";
  google_created_at: string;
  is_duplicate: boolean;
};

// Paleta del informe. El amarillo replica las celdas resaltadas del parte
// manual (highlighter). El resto es coherente con el parte existente.
const COLOR = {
  brand: "FF111111",
  ink: "FF1A1A1A",
  ink2: "FF555555",
  red: "FFB81F1F",
  yellow: "FFFFFF00", // amarillo puro, como el parte a mano
  header: "FFEDE7D6", // crema para cabeceras de tabla no-amarillas
  band: "FFE9DFC4",
  line: "FFCFC7B4",
  archivedBg: "FFF6E3DC",
} as const;

const REVIEWS_HARD_LIMIT = 5000;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const range = parseRange(fromParam, toParam, new Date(), commissionPeriodRange);
  const months = jorgeReportMonths(range);

  const supabase = await createClient();
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
  // Solo admin + gestor. Director / sales quedan fuera (defensa en profundidad
  // sobre el middleware, que abre /api/export/* también a office_director).
  if (profile?.role !== "admin" && profile?.role !== "reviews_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const reviewsCurrentQ = supabase
    .from("reviews")
    .select("id, sales_id, location_id, match_state, google_created_at, is_duplicate")
    .is("removed_at", null)
    .gte("google_created_at", months.currentWindow.startIso)
    .lt("google_created_at", months.currentWindow.endIso)
    .limit(REVIEWS_HARD_LIMIT)
    .returns<ReviewRangeRow[]>();
  const reviewsPreviousQ = supabase
    .from("reviews")
    .select("id, sales_id, location_id, match_state, google_created_at, is_duplicate")
    .is("removed_at", null)
    .gte("google_created_at", months.previousWindow.startIso)
    .lt("google_created_at", months.previousWindow.endIso)
    .limit(REVIEWS_HARD_LIMIT)
    .returns<ReviewRangeRow[]>();
  const salesQ = supabase
    .from("profiles")
    .select(
      "id, full_name, slug, status, joined_at, department, language, paused_reason, notes, location_id, role, location:locations(id, name)",
    )
    .in("role", ["sales", "office_director"])
    .returns<SalesRow[]>();
  const locationsQ = supabase
    .from("locations")
    .select("id, name, total_review_count, average_rating")
    .order("name")
    .returns<LocationRow[]>();

  const [reviewsCurrentRes, reviewsPreviousRes, salesRes, locationsRes] =
    await Promise.all([reviewsCurrentQ, reviewsPreviousQ, salesQ, locationsQ]);

  if (reviewsCurrentRes.error) {
    console.error("[export/jorge] reviewsCurrent failed:", reviewsCurrentRes.error);
    return NextResponse.json({ error: reviewsCurrentRes.error.message }, { status: 500 });
  }

  const reviewsCurrent = (reviewsCurrentRes.data ?? []).map(toReportReview);
  const reviewsPrevious = (reviewsPreviousRes.data ?? []).map(toReportReview);
  const sales = (salesRes.data ?? []).map(toReportSales);
  const locations = (locationsRes.data ?? []).map(toReportLocation);

  const grouped = groupActiveSalesByDepartment(sales);
  const allActiveSales = sales.filter(
    (s) => s.status !== "archived" && s.department !== null,
  );
  const archivedCurrent = archivedTotals(reviewsCurrent, sales);
  const archivedPrevious = archivedTotals(reviewsPrevious, sales);

  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ReseñaHub";
  workbook.created = new Date();

  const reportLine = `PARTE SEMANAL RESEÑAS EN REDES SOCIALES (Google)     FECHA: ${formatLongSpanishDate(new Date())}`;

  for (const dept of DEPARTMENT_ORDER) {
    // Comerciales del departamento. Los sales aparecen siempre; los
    // responsables (office_director) solo si tienen reseñas en la ventana
    // (los dos meses mostrados) — "incluyo a los responsables si tienen reseñas".
    const deptSales = grouped[dept].filter((s) => {
      if (s.role !== "office_director") return true;
      const n =
        countedFor(reviewsCurrent, s.id) + countedFor(reviewsPrevious, s.id);
      return n > 0;
    });

    renderSheet(workbook, {
      department: dept,
      sheetName: titleCase(DEPARTMENT_LABEL[dept]),
      deptSales,
      allActiveSales,
      locations,
      reviewsCurrent,
      reviewsPrevious,
      archivedCurrent: archivedCurrent[dept],
      archivedPrevious: archivedPrevious[dept],
      current: months.current,
      previous: months.previous,
      reportLine,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `informe-jorge-${range.slug}.xlsx`;

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

function renderSheet(
  workbook: ExcelJS.Workbook,
  data: {
    department: SalesDepartment;
    sheetName: string;
    deptSales: SalesForReport[];
    allActiveSales: SalesForReport[];
    locations: LocationForReport[];
    reviewsCurrent: ReviewForReport[];
    reviewsPrevious: ReviewForReport[];
    archivedCurrent: number;
    archivedPrevious: number;
    current: MonthRef;
    previous: MonthRef;
    reportLine: string;
  },
) {
  const {
    department,
    sheetName,
    deptSales,
    allActiveSales,
    locations,
    reviewsCurrent,
    reviewsPrevious,
    archivedCurrent,
    archivedPrevious,
    current,
    previous,
    reportLine,
  } = data;

  const sheet = workbook.addWorksheet(sheetName, {
    properties: { defaultRowHeight: 16 },
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.3,
        footer: 0.3,
      },
    },
  });
  // A3 = 8. Los typings de exceljs no incluyen 8 en la unión `PaperSize`, así
  // que lo asignamos con un cast acotado (el valor es válido en el .xlsx).
  (sheet.pageSetup as { paperSize?: number }).paperSize = 8;
  // 6 columnas: Nombre · Fecha incorporación · Zona · Reseñas anterior ·
  // Reseñas actual (amarilla) · Notas (sin cabecera).
  sheet.columns = [
    { key: "name", width: 40 },
    { key: "joined", width: 18 },
    { key: "zone", width: 28 },
    { key: "prev", width: 18 },
    { key: "current", width: 20 },
    { key: "notes", width: 40 },
  ];

  // Cabecera de valoración: la ficha principal del departamento. Para Nacional
  // e Internacional es Oropesa (la ficha Inseryal de la playa); para Castellón
  // y Valencia su propia ficha.
  const fichas = locationsForDepartment(department, locations, allActiveSales);
  const primaryFicha: LocationForReport =
    fichas[0] ?? {
      id: "__placeholder__",
      name: "Sin ficha asignada",
      total_review_count: null,
      average_rating: null,
    };

  let row = 1;

  // Fila 1: valoración acumulada de la ficha principal.
  sheet.mergeCells(`A${row}:F${row}`);
  const ratingCell = sheet.getCell(`A${row}`);
  ratingCell.value = formatRatingHeader(primaryFicha);
  ratingCell.font = { bold: true, size: 11.5, color: { argb: COLOR.brand } };
  ratingCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(row).height = 20;
  row += 2; // deja una fila en blanco

  // Departamento.
  sheet.mergeCells(`A${row}:F${row}`);
  const deptCell = sheet.getCell(`A${row}`);
  deptCell.value = `DEPARTAMENTO VENTAS ${DEPARTMENT_LABEL[department]}`;
  deptCell.font = { bold: true, size: 12, color: { argb: COLOR.brand } };
  deptCell.alignment = { vertical: "middle", horizontal: "left" };
  deptCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.band } };
  row += 1;

  // Mes actual (amarillo).
  sheet.mergeCells(`A${row}:F${row}`);
  const monthCell = sheet.getCell(`A${row}`);
  monthCell.value = `${formatUpperMonth(current.monthIndex)} DEL ${current.year}`;
  monthCell.font = { bold: true, size: 11, color: { argb: COLOR.brand } };
  monthCell.alignment = { vertical: "middle", horizontal: "center" };
  monthCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.yellow } };
  sheet.getRow(row).height = 18;
  row += 2;

  // Línea "parte semanal" (sin firmante).
  sheet.mergeCells(`A${row}:F${row}`);
  const reportCell = sheet.getCell(`A${row}`);
  reportCell.value = reportLine;
  reportCell.font = { italic: true, size: 10, color: { argb: COLOR.ink2 } };
  reportCell.alignment = { vertical: "middle", horizontal: "left" };
  row += 1;

  // Cabecera de tabla.
  const headerRow = row;
  const headers = [
    "NOMBRE COMERCIAL",
    "FECHA INCORPORACIÓN",
    "ZONA",
    `RESEÑAS ${formatMonthHeader(previous.monthIndex).toUpperCase()}`,
    `RESEÑAS ${formatMonthHeader(current.monthIndex).toUpperCase()}`,
    "",
  ];
  headers.forEach((h, i) => {
    const c = sheet.getCell(headerRow, i + 1);
    c.value = h;
    const isCurrentCol = i === 4;
    c.font = {
      bold: true,
      size: 10.5,
      color: { argb: isCurrentCol ? COLOR.red : COLOR.ink },
    };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isCurrentCol ? COLOR.yellow : COLOR.header },
    };
    c.alignment = {
      vertical: "middle",
      horizontal: i === 3 || i === 4 ? "center" : "left",
      wrapText: true,
    };
    c.border = allBorders();
  });
  sheet.getRow(headerRow).height = 28;
  row += 1;

  // Filas de comerciales.
  for (const s of deptSales) {
    const r = sheet.getRow(row);
    r.getCell(1).value = s.full_name;
    r.getCell(2).value = formatShortJoinedAt(s.joined_at);
    r.getCell(3).value = jorgeZoneFor(s);
    const prev = countedFor(reviewsPrevious, s.id);
    const curr = countedFor(reviewsCurrent, s.id);
    // Mostrar 0 explícito (no celda vacía) cuando no hay reseñas en el periodo.
    r.getCell(4).value = prev;
    r.getCell(5).value = curr;
    r.getCell(6).value = inlineNote(s) || null;
    r.getCell(1).font = { size: 11 };
    r.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    r.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
    r.getCell(3).alignment = { horizontal: "left", vertical: "middle" };
    r.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(6).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    // Columna del mes actual: amarilla en todas las filas.
    r.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.yellow } };
    for (let c = 1; c <= 6; c++) {
      r.getCell(c).border = allBorders();
    }
    row += 1;
  }
  if (deptSales.length === 0) {
    sheet.mergeCells(`A${row}:F${row}`);
    const empty = sheet.getCell(`A${row}`);
    empty.value = "Sin comerciales asignados a este departamento.";
    empty.font = { italic: true, size: 10.5, color: { argb: COLOR.ink2 } };
    empty.alignment = { horizontal: "center" };
    row += 1;
  }

  // Fila "RESEÑAS BAJAS COMERCIALES" (si hay reseñas de archivados).
  if (archivedCurrent > 0 || archivedPrevious > 0) {
    const r = sheet.getRow(row);
    sheet.mergeCells(`A${row}:C${row}`);
    r.getCell(1).value = "RESEÑAS BAJAS COMERCIALES";
    r.getCell(1).font = { italic: true, bold: true, size: 10.5, color: { argb: COLOR.brand } };
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.archivedBg } };
    r.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    r.getCell(4).value = archivedPrevious;
    r.getCell(5).value = archivedCurrent;
    r.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(4).font = { bold: true, size: 10.5, color: { argb: COLOR.brand } };
    r.getCell(5).font = { bold: true, size: 10.5, color: { argb: COLOR.brand } };
    r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.archivedBg } };
    r.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.yellow } };
    for (let c = 1; c <= 5; c++) r.getCell(c).border = allBorders();
    row += 1;
  }

  // Fila TOTAL (amarilla completa).
  const totalPrev =
    deptSales.reduce((acc, s) => acc + countedFor(reviewsPrevious, s.id), 0) +
    archivedPrevious;
  const totalCurr =
    deptSales.reduce((acc, s) => acc + countedFor(reviewsCurrent, s.id), 0) +
    archivedCurrent;
  const totalRow = sheet.getRow(row);
  sheet.mergeCells(`A${row}:C${row}`);
  totalRow.getCell(1).value = `NÚMERO TOTAL DE RESEÑAS COMISIONADAS DEPTO ${DEPARTMENT_LABEL[department]}`;
  for (let c = 1; c <= 6; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.yellow } };
    cell.border = allBorders();
    cell.font = { bold: true, size: 11, color: { argb: COLOR.brand } };
    cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "center" };
  }
  totalRow.getCell(4).value = totalPrev;
  totalRow.getCell(5).value = totalCurr;
  totalRow.height = 20;
  row += 2;

  // Pie.
  sheet.mergeCells(`A${row}:F${row}`);
  const foot = sheet.getCell(`A${row}`);
  foot.value = "VACACIONES Y BAJAS MÉDICAS";
  foot.font = { italic: true, size: 10, color: { argb: COLOR.ink2 } };
  foot.alignment = { horizontal: "left" };

  sheet.views = [{ state: "normal" }];
}

function allBorders(): Partial<ExcelJS.Borders> {
  const side = { style: "thin" as const, color: { argb: COLOR.line } };
  return { top: side, bottom: side, left: side, right: side };
}

function toReportSales(r: SalesRow): SalesForReport {
  return {
    id: r.id,
    full_name: r.full_name,
    slug: r.slug,
    status: r.status,
    joined_at: r.joined_at,
    department: r.department,
    language: r.language,
    paused_reason: r.paused_reason,
    notes: r.notes,
    location_id: r.location_id,
    location_name: r.location?.name ?? null,
    role: r.role,
  };
}

function toReportLocation(r: LocationRow): LocationForReport {
  return {
    id: r.id,
    name: r.name,
    total_review_count: r.total_review_count,
    average_rating: r.average_rating,
  };
}

function toReportReview(r: ReviewRangeRow): ReviewForReport {
  return {
    id: r.id,
    sales_id: r.sales_id,
    location_id: r.location_id,
    match_state: r.match_state,
    google_created_at: r.google_created_at,
    is_duplicate: r.is_duplicate,
  };
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLocaleLowerCase("es");
}
