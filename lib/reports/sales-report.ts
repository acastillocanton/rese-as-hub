/**
 * Excel propio de un comercial: bloque de cabecera (nombre / fecha
 * incorporación / zona / periodo / total) + tabla con sus reseñas
 * `counted` no duplicadas del rango. Filtrado anti-fraude (mig 015):
 * solo principales `counted`, no `removed_at`.
 *
 * Llamado desde `app/api/export/sales/[id]/route.ts`. Mantener este
 * módulo sin side effects facilita los tests unit.
 *
 * NO confundir con `lib/reports/weekly-report.ts`, que genera el parte
 * GLOBAL con 4 hojas departamentales — diseñado para reporting interno
 * de Raquel. Este helper genera el parte INDIVIDUAL — útil para auditar
 * la producción de un comercial o pasar el detalle al área de pagos.
 */

import { buildGoogleReviewListUrl } from "@/lib/google/review-url";
import { excelSafe } from "@/lib/reports/excel-safe";
import type { SalesDepartment } from "@/lib/supabase/types";
import { formatEuro } from "@/lib/utils";

/**
 * Labels legibles del departamento para el Excel individual.
 * Notar que `lib/reports/weekly-report.ts::DEPARTMENT_LABEL` usa
 * mayúsculas ("NACIONAL") porque allí encajan visualmente en el header
 * del parte oficial; aquí queremos caja normal de presentación.
 */
const DEPARTMENT_LABEL_PRETTY: Record<SalesDepartment, string> = {
  nacional: "Nacional",
  internacional: "Internacional",
  castellon: "Castellón",
  valencia: "Valencia",
};

export type SalesReportProfile = {
  full_name: string;
  joined_at: string | null;
  department: SalesDepartment | null;
  location_name: string | null;
  role: "sales" | "office_director";
  /** Tarifa €/reseña (mig 020). NULL = sin tarifa configurada → la comisión se muestra "—". */
  commissionRate: number | null;
};

export type SalesReportReview = {
  google_created_at: string;
  client_name: string | null;
  rating: number;
  author_name: string;
  place_id: string | null;
};

export type SalesReportRange = {
  from: string;
  to: string;
  label: string;
};

export type SalesReportInput = {
  profile: SalesReportProfile;
  range: SalesReportRange;
  reviews: SalesReportReview[];
};

/**
 * Formatea ISO date (o null) a "DD/MM/YYYY" en formato español. Usa
 * "—" como fallback. Función pura — testeable.
 */
export function formatJoinedAtForExcel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Compone la zona del comercial como "Departamento (Ficha)". Si falta
 * alguno de los dos, omite el paréntesis o el principal según el caso.
 * Función pura.
 */
export function formatDepartmentForExcel(
  department: SalesDepartment | null,
  locationName: string | null,
): string {
  const dept = department ? DEPARTMENT_LABEL_PRETTY[department] : null;
  if (dept && locationName) return `${dept} (${locationName})`;
  if (dept) return dept;
  if (locationName) return locationName;
  return "—";
}

/**
 * Formatea ISO timestamp a "DD/MM/YYYY HH:mm" en formato español.
 * Pura, sin TZ tricks: usa la TZ del runtime (servidor → UTC en Vercel).
 */
export function formatReviewDateForExcel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/**
 * Convierte el rating numérico (1-5) a una representación textual con
 * estrellas para mostrar en la celda. Mantiene el número entre paréntesis
 * para que sea fácil de filtrar/ordenar en Excel.
 */
export function formatRatingForExcel(rating: number): string {
  const clamped = Math.max(0, Math.min(5, Math.round(rating)));
  return `${"★".repeat(clamped)}${"☆".repeat(5 - clamped)} (${clamped})`;
}

/**
 * Slug del nombre del archivo. Reemplaza chars no ASCII por guión, y
 * trims dobles. Pensado para `Content-Disposition` sin necesitar
 * encoding RFC 5987.
 */
export function buildSalesReportFilename(
  profileFullName: string,
  range: SalesReportRange,
): string {
  const slug = profileFullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `resenas-${slug || "comercial"}-${range.from}-a-${range.to}.xlsx`;
}

/**
 * Genera el Excel del comercial individual y devuelve un Buffer listo
 * para servir en la respuesta HTTP. ExcelJS se importa dinámicamente
 * (~500KB) para no engrosar el bundle del resto de la app.
 */
export async function buildSalesReport(
  input: SalesReportInput,
): Promise<Buffer> {
  // Import dinámico — patrón del repo (ver app/api/export/reviews/route.ts).
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ReseñaHub";
  wb.created = new Date();

  const ws = wb.addWorksheet("Reseñas");

  const rate = input.profile.commissionRate;

  // Anchos de columna (orientativo, Excel los respeta).
  ws.columns = [
    { width: 22 }, // A · Fecha o Label
    { width: 28 }, // B · Cliente o Valor cabecera
    { width: 22 }, // C · Autor
    { width: 14 }, // D · Valoración
    { width: 22 }, // E · Enlace
    { width: 16 }, // F · Comisión €
  ];

  const titleCell = ws.getCell("A1");
  titleCell.value = "Reseñas del comercial";
  titleCell.font = { name: "Calibri", size: 14, bold: true };

  // Bloque cabecera (filas 3-8).
  const headerRows: Array<[string, string]> = [
    ["Comercial:", input.profile.full_name],
    ["Fecha incorporación:", formatJoinedAtForExcel(input.profile.joined_at)],
    ["Zona:", formatDepartmentForExcel(input.profile.department, input.profile.location_name)],
    ["Periodo:", input.range.label],
    ["Total reseñas:", String(input.reviews.length)],
    ["Tarifa por reseña:", rate !== null ? formatEuro(rate) : "Sin tarifa configurada"],
  ];
  headerRows.forEach(([label, value], i) => {
    const rowIdx = 3 + i;
    const labelCell = ws.getCell(`A${rowIdx}`);
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: "FF666666" } };
    const valueCell = ws.getCell(`B${rowIdx}`);
    valueCell.value = value;
  });

  // Fila vacía (9) y tabla a partir de la 10.
  const tableHeaderRow = 10;
  const headers = ["Fecha", "Cliente", "Autor", "Valoración", "Enlace", "Comisión €"];
  headers.forEach((label, col) => {
    const cell = ws.getCell(tableHeaderRow, col + 1);
    cell.value = label;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEEEEE" },
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
  });

  // Filas de datos. Ordenadas por google_created_at desc (más reciente
  // arriba, igual que las pantallas del producto).
  const sorted = [...input.reviews].sort((a, b) =>
    b.google_created_at.localeCompare(a.google_created_at),
  );

  if (sorted.length === 0) {
    // Nota informativa cuando el comercial no tiene reseñas en el rango.
    const noteRow = tableHeaderRow + 1;
    const noteCell = ws.getCell(`A${noteRow}`);
    noteCell.value = "Sin reseñas atribuidas en este periodo.";
    noteCell.font = { italic: true, color: { argb: "FF888888" } };
    ws.mergeCells(`A${noteRow}:F${noteRow}`);
  } else {
    sorted.forEach((r, i) => {
      const rowIdx = tableHeaderRow + 1 + i;
      ws.getCell(rowIdx, 1).value = formatReviewDateForExcel(r.google_created_at);
      ws.getCell(rowIdx, 2).value = excelSafe(r.client_name ?? "—");
      ws.getCell(rowIdx, 3).value = excelSafe(r.author_name);
      ws.getCell(rowIdx, 4).value = formatRatingForExcel(r.rating);
      const linkCell = ws.getCell(rowIdx, 5);
      const url = buildGoogleReviewListUrl(r.place_id);
      if (url) {
        linkCell.value = { text: "Ver en Google", hyperlink: url };
        linkCell.font = { color: { argb: "FF1A73E8" }, underline: true };
      } else {
        linkCell.value = "—";
      }
      // Comisión por reseña abonable: cada fila es una `counted` → tarifa × 1.
      ws.getCell(rowIdx, 6).value = rate !== null ? formatEuro(rate) : "—";
    });

    // Fila de total de comisión al pie de la tabla.
    const totalRow = tableHeaderRow + 1 + sorted.length;
    const totalLabelCell = ws.getCell(totalRow, 5);
    totalLabelCell.value = "TOTAL COMISIÓN";
    totalLabelCell.font = { bold: true };
    totalLabelCell.alignment = { horizontal: "right" };
    const totalValueCell = ws.getCell(totalRow, 6);
    totalValueCell.value = rate !== null ? formatEuro(rate * sorted.length) : "—";
    totalValueCell.font = { bold: true };
    totalValueCell.border = {
      top: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
  }

  // exceljs devuelve un ArrayBuffer; Buffer.from cubre el tipo para
  // NextResponse en Node runtime.
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}
