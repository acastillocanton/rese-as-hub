import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRange, previousMonthRange, rangeYearMonth } from "@/lib/date-range";
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
  zoneFor,
  type LocationForReport,
  type ReviewForReport,
  type SalesForReport,
} from "@/lib/reports/weekly-report";
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
 * Export Excel "Parte semanal de Raquel". Estructura:
 *   - 4 hojas departamentales (NACIONAL / INTERNACIONAL / CASTELLÓN / VALENCIA)
 *     que reproducen 1:1 el parte manual.
 *   - 1 hoja "Detalle" con tabla de reseñas individuales (auditoría) —
 *     responde a los filtros sales_id / location_id / match_state.
 *
 * Query params:
 *   - from / to: yyyy-mm-dd (default: mes en curso).
 *   - sales_id / location_id / match_state: filtros que aplican SOLO a la
 *     hoja Detalle (las 4 hojas departamentales siempre incluyen todos los
 *     departamentos completos para que el parte tenga sentido como informe).
 *
 * Acceso: middleware ya gatea /api/export/* a admin + reviews_manager.
 * Re-validamos por defensa en profundidad.
 */
type ReviewDetailRow = {
  id: string;
  google_review_id: string;
  author_name: string;
  rating: number;
  text: string | null;
  google_created_at: string;
  match_state: "counted" | "pending" | "unmatched";
  match_confidence: number;
  sales_id: string | null;
  location_id: string;
  sales: { full_name: string; slug: string } | null;
  client: { full_name: string } | null;
  location: { name: string } | null;
};

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
};

const MATCH_LABEL: Record<string, string> = {
  counted: "Atribuida automática",
  pending: "Pendiente verificar",
  unmatched: "Sin atribuir",
};

// Paleta del parte. Coherente con el diseño del producto (crema + tinta).
// Usamos tonos discretos: el parte se imprime y se reenvía por email.
const COLOR = {
  brand: "FF111111",
  cream: "FFF5F3EE",
  cream2: "FFEFEAD7",
  band: "FFE9DFC4", // banda más cálida para cabeceras de ficha
  line: "FFE9E4D8",
  ink: "FF1A1A1A",
  ink2: "FF555555",
  red: "FFB81F1F",
  totalsBg: "FFF1ECDB",
  archivedBg: "FFF6E3DC",
  noteBg: "FFFFFFFF",
} as const;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const salesIdFilter = url.searchParams.get("sales_id");
  let locationIdFilter = url.searchParams.get("location_id");
  const matchStateFilter = url.searchParams.get("match_state");
  const range = parseRange(fromParam, toParam);
  const previous = previousMonthRange(range);
  const ym = rangeYearMonth(range);
  const ymPrev = rangeYearMonth(previous);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, location_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string; full_name: string; location_id: string | null }>();
  if (
    profile?.role !== "admin" &&
    profile?.role !== "reviews_manager" &&
    profile?.role !== "office_director"
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Office director: forzamos location_id a su ficha, ignorando lo que mande
  // el query string. La RLS también lo restringe, pero aquí evitamos hacer
  // queries vacías a propósito y dejamos el log más claro.
  if (profile.role === "office_director") {
    if (!profile.location_id) {
      return NextResponse.json(
        { error: "director_without_location" },
        { status: 400 },
      );
    }
    locationIdFilter = profile.location_id;
  }

  // Límite defensivo para no timeout en Vercel (60s) ni saturar memoria al
  // generar el Excel. Si el rango pide más, el caller debería trocear (la UI
  // ofrece 3 atajos de máx 90 días, suficiente en la práctica).
  const REVIEWS_HARD_LIMIT = 5000;

  // Carga en paralelo. Para el parte necesitamos:
  //   - reviews del periodo seleccionado (sin filtros — el parte ignora
  //     sales_id/location_id/match_state, esos solo afectan al detalle).
  //     Filtramos `removed_at IS NULL` para excluir reseñas eliminadas en
  //     Google (soft-delete del cron, ver migración correspondiente).
  //   - reviews del mes anterior (comparativa).
  //   - todos los profiles role='sales' incluidos archived.
  //   - todas las locations con rating cacheado.
  //   - reviews para la hoja Detalle (con todos los filtros aplicados +
  //     joins para autor, ficha, comercial, cliente).
  const reviewsCurrentQ = supabase
    .from("reviews")
    .select("id, sales_id, location_id, match_state, google_created_at")
    .is("removed_at", null)
    .gte("google_created_at", range.startIso)
    .lt("google_created_at", range.endIso)
    .limit(REVIEWS_HARD_LIMIT)
    .returns<ReviewRangeRow[]>();
  const reviewsPreviousQ = supabase
    .from("reviews")
    .select("id, sales_id, location_id, match_state, google_created_at")
    .is("removed_at", null)
    .gte("google_created_at", previous.startIso)
    .lt("google_created_at", previous.endIso)
    .limit(REVIEWS_HARD_LIMIT)
    .returns<ReviewRangeRow[]>();
  const salesQ = supabase
    .from("profiles")
    .select(
      "id, full_name, slug, status, joined_at, department, language, paused_reason, notes, location_id, location:locations(id, name)",
    )
    .eq("role", "sales")
    .returns<SalesRow[]>();
  const locationsQ = supabase
    .from("locations")
    .select("id, name, total_review_count, average_rating")
    .order("name")
    .returns<LocationRow[]>();

  let detailQ = supabase
    .from("reviews")
    .select(
      "id, google_review_id, author_name, rating, text, google_created_at, match_state, match_confidence, sales_id, location_id, sales:profiles!reviews_sales_id_fkey(full_name, slug), client:clients(full_name), location:locations(name)",
    )
    .is("removed_at", null)
    .gte("google_created_at", range.startIso)
    .lt("google_created_at", range.endIso)
    .order("google_created_at", { ascending: true })
    .limit(REVIEWS_HARD_LIMIT);
  if (salesIdFilter) detailQ = detailQ.eq("sales_id", salesIdFilter);
  if (locationIdFilter) detailQ = detailQ.eq("location_id", locationIdFilter);
  if (matchStateFilter) detailQ = detailQ.eq("match_state", matchStateFilter);

  const [reviewsCurrentRes, reviewsPreviousRes, salesRes, locationsRes, detailRes] =
    await Promise.all([
      reviewsCurrentQ,
      reviewsPreviousQ,
      salesQ,
      locationsQ,
      detailQ.returns<ReviewDetailRow[]>(),
    ]);

  if (reviewsCurrentRes.error) {
    console.error("[export/reviews] reviewsCurrent failed:", reviewsCurrentRes.error);
    return NextResponse.json({ error: reviewsCurrentRes.error.message }, { status: 500 });
  }

  const reviewsCurrent = (reviewsCurrentRes.data ?? []).map(toReportReview);
  const reviewsPrevious = (reviewsPreviousRes.data ?? []).map(toReportReview);
  const sales = (salesRes.data ?? []).map(toReportSales);
  const locations = (locationsRes.data ?? []).map(toReportLocation);
  const detailReviews = detailRes.data ?? [];

  const grouped = groupActiveSalesByDepartment(sales);
  const archivedCurrent = archivedTotals(reviewsCurrent, sales);
  const archivedPrevious = archivedTotals(reviewsPrevious, sales);

  // ─── Workbook ──────────────────────────────────────────────────────────
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ReseñaHub";
  workbook.created = new Date();

  for (const dept of DEPARTMENT_ORDER) {
    renderDepartmentSheet(workbook, {
      department: dept,
      sheetName: titleCase(DEPARTMENT_LABEL[dept]),
      activeSales: grouped[dept],
      allActiveSales: sales.filter((s) => s.status !== "archived" && s.department !== null),
      locations,
      reviewsCurrent,
      reviewsPrevious,
      archivedCurrent: archivedCurrent[dept],
      archivedPrevious: archivedPrevious[dept],
      currentMonth: { year: ym.year, monthIndex: ym.monthIndex },
      previousMonth: { year: ymPrev.year, monthIndex: ymPrev.monthIndex },
      reportLine: `PARTE SEMANAL RESEÑAS EN REDES SOCIALES (Google)  FECHA: ${formatLongSpanishDate(
        new Date(),
      )}  DE: ${profile?.full_name ?? "—"}`,
    });
  }

  renderDetailSheet(workbook, detailReviews);

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `parte-resenas-${range.slug}.xlsx`;

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

// ─── Render: una hoja departamental ────────────────────────────────────────
function renderDepartmentSheet(
  workbook: ExcelJS.Workbook,
  data: {
    department: SalesDepartment;
    sheetName: string;
    activeSales: SalesForReport[];
    allActiveSales: SalesForReport[];
    locations: LocationForReport[];
    reviewsCurrent: ReviewForReport[];
    reviewsPrevious: ReviewForReport[];
    archivedCurrent: number;
    archivedPrevious: number;
    currentMonth: { year: number; monthIndex: number };
    previousMonth: { year: number; monthIndex: number };
    reportLine: string;
  },
) {
  const {
    department,
    sheetName,
    activeSales,
    allActiveSales,
    locations,
    reviewsCurrent,
    reviewsPrevious,
    archivedCurrent,
    archivedPrevious,
    currentMonth,
    previousMonth,
    reportLine,
  } = data;

  const sheet = workbook.addWorksheet(sheetName, {
    properties: { defaultRowHeight: 16 },
  });
  // 6 columnas: Nombre · Fecha incorporación · Zona · Reseñas anterior ·
  // Reseñas actual · Notas.
  sheet.columns = [
    { key: "name", width: 34 },
    { key: "joined", width: 16 },
    { key: "zone", width: 26 },
    { key: "prev", width: 18 },
    { key: "current", width: 18 },
    { key: "notes", width: 38 },
  ];

  // Pintamos un bloque por cada ficha del departamento. Para departamentos
  // con una sola ficha (internacional, castellón, valencia) sale un único
  // bloque; para nacional pueden ser 4-5 sub-bloques (Inseryal × N).
  const fichasForDept = locationsForDepartment(department, locations, allActiveSales);

  // Si no hay ninguna ficha aplicable (raro: dept vacío sin comerciales y sin
  // fichas heurísticamente identificadas), pintamos un bloque "placeholder".
  const blocks: LocationForReport[] =
    fichasForDept.length > 0
      ? fichasForDept
      : [
          {
            id: "__placeholder__",
            name: "Sin ficha asignada",
            total_review_count: null,
            average_rating: null,
          },
        ];

  let row = 1;
  for (let i = 0; i < blocks.length; i++) {
    const ficha = blocks[i]!;
    row = renderFichaBlock(sheet, row, {
      department,
      ficha,
      activeSales: activeSales.filter((s) => filterSalesByFicha(s, ficha.id)),
      reviewsCurrent,
      reviewsPrevious,
      currentMonth,
      previousMonth,
      reportLine,
    });
    if (i < blocks.length - 1) row += 2;
  }

  row += 1;

  // Fila "RESEÑAS BAJAS COMERCIALES" si hay reseñas archivadas en cualquiera
  // de los dos meses. Reemplaza la nota que llevaba Raquel a mano.
  if (archivedCurrent > 0 || archivedPrevious > 0) {
    sheet.mergeCells(`A${row}:C${row}`);
    sheet.getCell(`A${row}`).value = "RESEÑAS BAJAS COMERCIALES";
    const labelCell = sheet.getCell(`A${row}`);
    labelCell.font = { italic: true, bold: true, size: 11, color: { argb: COLOR.brand } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.archivedBg } };
    labelCell.alignment = { horizontal: "left", vertical: "middle" };
    labelCell.border = {
      top: { style: "thin", color: { argb: COLOR.line } },
      bottom: { style: "thin", color: { argb: COLOR.line } },
    };
    sheet.getCell(`D${row}`).value = archivedPrevious || null;
    sheet.getCell(`E${row}`).value = archivedCurrent || null;
    for (const col of ["D", "E"] as const) {
      const c = sheet.getCell(`${col}${row}`);
      c.font = { bold: true, size: 11, color: { argb: COLOR.brand } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.archivedBg } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = {
        top: { style: "thin", color: { argb: COLOR.line } },
        bottom: { style: "thin", color: { argb: COLOR.line } },
      };
    }
    row += 1;
  }

  // Total general del departamento (siempre se pinta).
  const totalCurrent =
    activeSales.reduce((s, sales) => s + countedFor(reviewsCurrent, sales.id), 0) +
    archivedCurrent;
  const totalPrev =
    activeSales.reduce((s, sales) => s + countedFor(reviewsPrevious, sales.id), 0) +
    archivedPrevious;
  sheet.mergeCells(`A${row}:C${row}`);
  sheet.getCell(`A${row}`).value =
    `NÚMERO TOTAL DE RESEÑAS COMISIONADAS DEPTO ${DEPARTMENT_LABEL[department]}`;
  styleTotalLabel(sheet.getCell(`A${row}`));
  sheet.getCell(`D${row}`).value = totalPrev;
  sheet.getCell(`E${row}`).value = totalCurrent;
  styleTotalNumber(sheet.getCell(`D${row}`));
  styleTotalNumber(sheet.getCell(`E${row}`));

  // Pie decorativo.
  row += 2;
  sheet.mergeCells(`A${row}:F${row}`);
  const foot = sheet.getCell(`A${row}`);
  foot.value = "VACACIONES Y BAJAS MÉDICAS";
  foot.font = { italic: true, size: 10, color: { argb: COLOR.ink2 } };
  foot.alignment = { horizontal: "center" };

  sheet.views = [{ state: "normal" }];
}

function filterSalesByFicha(s: SalesForReport, fichaId: string): boolean {
  if (fichaId === "__placeholder__") return true;
  // Internacional: todos los comerciales del departamento van bajo el bloque
  // de Oropesa (que es el único bloque del departamento). Así que basta con
  // que el comercial pertenezca al departamento — el filtro por
  // location_id es ruidoso cuando la realidad operativa es "todo va a
  // Oropesa".
  if (s.department === "internacional") return true;
  return s.location_id === fichaId;
}

function renderFichaBlock(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  args: {
    department: SalesDepartment;
    ficha: LocationForReport;
    activeSales: SalesForReport[];
    reviewsCurrent: ReviewForReport[];
    reviewsPrevious: ReviewForReport[];
    currentMonth: { year: number; monthIndex: number };
    previousMonth: { year: number; monthIndex: number };
    reportLine: string;
  },
): number {
  const {
    department,
    ficha,
    activeSales,
    reviewsCurrent,
    reviewsPrevious,
    currentMonth,
    previousMonth,
    reportLine,
  } = args;

  let row = startRow;

  // Cabecera 1: marca + total acumulado + rating.
  sheet.mergeCells(`A${row}:F${row}`);
  const titleCell = sheet.getCell(`A${row}`);
  titleCell.value = formatRatingHeader(ficha);
  titleCell.font = { bold: true, size: 11.5, color: { argb: COLOR.brand } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.band } };
  sheet.getRow(row).height = 22;
  row += 1;

  // Línea en blanco.
  row += 1;

  // Cabecera 2: departamento.
  sheet.mergeCells(`A${row}:F${row}`);
  const deptCell = sheet.getCell(`A${row}`);
  deptCell.value = `DEPARTAMENTO VENTAS ${DEPARTMENT_LABEL[department]}`;
  deptCell.font = { bold: true, size: 11, color: { argb: COLOR.brand } };
  deptCell.alignment = { vertical: "middle", horizontal: "center" };
  row += 1;

  // Cabecera 3: mes.
  sheet.mergeCells(`A${row}:F${row}`);
  const monthCell = sheet.getCell(`A${row}`);
  monthCell.value = `${formatUpperMonth(currentMonth.monthIndex)} DEL ${currentMonth.year}`;
  monthCell.font = { bold: true, size: 10.5, color: { argb: COLOR.ink2 } };
  monthCell.alignment = { vertical: "middle", horizontal: "center" };
  row += 2;

  // Cabecera 4: parte semanal.
  sheet.mergeCells(`A${row}:F${row}`);
  const reportCell = sheet.getCell(`A${row}`);
  reportCell.value = reportLine;
  reportCell.font = { italic: true, size: 10, color: { argb: COLOR.ink2 } };
  reportCell.alignment = { vertical: "middle", horizontal: "center" };
  row += 2;

  // Fila cabeceras de tabla.
  const headerRow = row;
  const headers = [
    "NOMBRE COMERCIAL",
    "FECHA INCORPORACIÓN",
    "ZONA",
    `RESEÑAS ${formatMonthHeader(previousMonth.monthIndex).toUpperCase()}`,
    `RESEÑAS ${formatMonthHeader(currentMonth.monthIndex).toUpperCase()}`,
    "NOTAS",
  ];
  headers.forEach((h, i) => {
    const c = sheet.getCell(headerRow, i + 1);
    c.value = h;
    c.font = {
      bold: true,
      size: 10.5,
      color: { argb: i === 4 ? COLOR.red : COLOR.ink },
    };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.cream } };
    c.alignment = {
      vertical: "middle",
      horizontal: i === 3 || i === 4 ? "center" : "left",
      wrapText: true,
    };
    c.border = {
      top: { style: "thin", color: { argb: COLOR.line } },
      bottom: { style: "thin", color: { argb: COLOR.line } },
    };
  });
  sheet.getRow(headerRow).height = 24;
  row += 1;

  // Filas de comerciales activos.
  const firstSalesRow = row;
  for (const s of activeSales) {
    const r = sheet.getRow(row);
    r.getCell(1).value = s.full_name;
    r.getCell(2).value = formatShortJoinedAt(s.joined_at);
    r.getCell(3).value = zoneFor(s);
    const prev = countedFor(reviewsPrevious, s.id);
    const curr = countedFor(reviewsCurrent, s.id);
    r.getCell(4).value = prev || null;
    r.getCell(5).value = curr || null;
    r.getCell(6).value = inlineNote(s) || null;
    r.getCell(1).font = { size: 11 };
    r.getCell(2).alignment = { horizontal: "left" };
    r.getCell(3).alignment = { horizontal: "left" };
    r.getCell(4).alignment = { horizontal: "center" };
    r.getCell(5).alignment = { horizontal: "center" };
    r.getCell(6).alignment = { horizontal: "left", wrapText: true };
    if (s.status === "paused") {
      r.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.cream2 } };
      r.getCell(6).font = { italic: true, size: 10.5, color: { argb: COLOR.ink2 } };
    }
    for (let c = 1; c <= 6; c++) {
      r.getCell(c).border = {
        bottom: { style: "hair", color: { argb: COLOR.line } },
      };
    }
    row += 1;
  }
  if (activeSales.length === 0) {
    sheet.mergeCells(`A${row}:F${row}`);
    const empty = sheet.getCell(`A${row}`);
    empty.value = "Sin comerciales asignados a este bloque.";
    empty.font = { italic: true, size: 10.5, color: { argb: COLOR.ink2 } };
    empty.alignment = { horizontal: "center" };
    row += 1;
  }

  // Fila "RESEÑAS BAJAS COMERCIALES" — solo en el primer bloque del depto
  // y solo si efectivamente hay reseñas archivadas (para no ensuciar
  // hojas con totales a cero).
  //
  // Nota: las bajas son del DEPARTAMENTO completo, no de la ficha
  // individual. Si el depto tiene varios bloques (caso Nacional), la fila
  // se renderiza solo una vez, fuera de los bloques individuales, en
  // renderDepartmentSheet (sección "total general"). Aquí solo lo hacemos
  // si es el ÚNICO bloque (departamentos sencillos: Internacional /
  // Castellón / Valencia).
  return row;
}

// ─── Render: hoja Detalle ──────────────────────────────────────────────────
function renderDetailSheet(workbook: ExcelJS.Workbook, reviews: ReviewDetailRow[]) {
  const sheet = workbook.addWorksheet("Detalle");
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
    fgColor: { argb: COLOR.cream },
  };
  sheet.getRow(1).alignment = { vertical: "middle" };

  for (const r of reviews) {
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
}

// ─── Helpers de styling ────────────────────────────────────────────────────
function styleTotalLabel(c: ExcelJS.Cell) {
  c.font = { bold: true, size: 11, color: { argb: COLOR.brand } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.totalsBg } };
  c.alignment = { horizontal: "left", vertical: "middle" };
  c.border = {
    top: { style: "thin", color: { argb: COLOR.line } },
    bottom: { style: "thin", color: { argb: COLOR.line } },
  };
}

function styleTotalNumber(c: ExcelJS.Cell) {
  c.font = { bold: true, size: 11, color: { argb: COLOR.brand } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.totalsBg } };
  c.alignment = { horizontal: "center", vertical: "middle" };
  c.border = {
    top: { style: "thin", color: { argb: COLOR.line } },
    bottom: { style: "thin", color: { argb: COLOR.line } },
  };
}

// ─── Conversores Row → ReportType ──────────────────────────────────────────
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
  };
}

function titleCase(s: string): string {
  // "NACIONAL" → "Nacional", "CASTELLÓN" → "Castellón".
  return s.charAt(0) + s.slice(1).toLocaleLowerCase("es");
}
