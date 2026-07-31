/**
 * Helpers puros (sin I/O) del "Informe Jorge" — la variante del parte pensada
 * para imprimir en A3, con 4 hojas departamentales (Nacional / Internacional /
 * Castellón / Valencia) y celdas amarillas, replicando el parte manual.
 *
 * La agrupación por departamento, el conteo por comercial y los helpers de
 * formato se reutilizan de `weekly-report.ts`; aquí solo vive lo específico
 * del Informe Jorge: derivar los DOS periodos de facturación que comparan las
 * columnas a partir del periodo que elige el usuario.
 *
 * ⚠️ Las columnas NO son meses naturales: son **periodos de facturación**
 * (= periodo de comisión, del día 20 al 19 del mes siguiente, §4.35). Cada
 * periodo se NOMBRA por su mes de CIERRE (día 19): el periodo 20-feb→19-mar es
 * "MARZO" (así lo hace el parte manual: hecho el 12-mar, titulado "MARZO").
 */

import type { DateRange } from "@/lib/date-range";
import {
  commissionPeriodRange,
  previousCommissionPeriodRange,
} from "@/lib/date-range";
import { zoneFor, type SalesForReport } from "@/lib/reports/weekly-report";

/**
 * Zona para el Informe Jorge. En internacional es el idioma (igual que
 * `zoneFor`). En el resto (nacional / castellón / valencia) devuelve el nombre
 * CORTO de la ficha: quita el prefijo de marca hasta el separador "·", p.ej.
 * "Inseryal by Marina d'Or · Oropesa" → "Oropesa",
 * "Marina d'Or Construcciones · Castellón" → "Castellón".
 * Además quita el prefijo "Madrid " de las fichas de Madrid:
 * "... · Madrid Pardiñas" → "Pardiñas",
 * "... · Madrid Príncipe de Vergara" → "Príncipe de Vergara".
 * Si el nombre no lleva "·", se devuelve (sin el "Madrid " inicial si lo lleva).
 */
export function jorgeZoneFor(sales: SalesForReport): string {
  const full = zoneFor(sales);
  if (sales.department === "internacional") return full;
  const idx = full.lastIndexOf("·");
  let short = idx >= 0 ? full.slice(idx + 1).trim() : full;
  if (short.startsWith("Madrid ")) short = short.slice("Madrid ".length).trim();
  return short;
}

export type MonthRef = { year: number; monthIndex: number };
export type MonthWindow = { startIso: string; endIso: string };

/** Fecha de referencia (medianoche local) desde el `from` del rango elegido. */
function refDateFromRange(range: DateRange): Date {
  const parts = range.from.split("-").map(Number);
  return new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

/** Mes de CIERRE de un periodo de facturación (el día 19 de `to` lo nombra). */
function closingMonthRef(range: DateRange): MonthRef {
  const parts = range.to.split("-").map(Number);
  return { year: parts[0] ?? 1970, monthIndex: (parts[1] ?? 1) - 1 };
}

/**
 * A partir del periodo seleccionado, el Informe Jorge compara DOS periodos de
 * facturación (20→19): el que contiene la selección ("actual") y el
 * inmediatamente anterior.
 *
 * El nombre de cada columna es el MES DE CIERRE del periodo. Ejemplo: generado
 * el 31-jul con el periodo de comisión vigente (20-jul→19-ago), la columna
 * "actual" es AGOSTO (el periodo de facturación en curso, que ya trae las
 * reseñas del 20-jul en adelante) y la "anterior" es JULIO (20-jun→19-jul).
 *
 * El conteo de cada columna se hace dentro de la ventana del periodo de
 * facturación completo, NO de un mes natural.
 */
export function jorgeReportMonths(range: DateRange): {
  current: MonthRef;
  previous: MonthRef;
  currentWindow: MonthWindow;
  previousWindow: MonthWindow;
} {
  const ref = refDateFromRange(range);
  const currentPeriod = commissionPeriodRange(ref);
  const previousPeriod = previousCommissionPeriodRange(ref);
  return {
    current: closingMonthRef(currentPeriod),
    previous: closingMonthRef(previousPeriod),
    currentWindow: {
      startIso: currentPeriod.startIso,
      endIso: currentPeriod.endIso,
    },
    previousWindow: {
      startIso: previousPeriod.startIso,
      endIso: previousPeriod.endIso,
    },
  };
}
