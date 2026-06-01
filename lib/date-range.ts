/**
 * Helpers de rango de fechas para los filtros del manager.
 *
 * Convención:
 *  - `from` y `to` son fechas naturales en formato `yyyy-mm-dd` (sin hora).
 *  - El rango incluye `from` y `to` enteros: si pides `from=2026-05-01` y
 *    `to=2026-05-31`, las queries usan `>= 2026-05-01T00:00 local` y
 *    `< 2026-06-01T00:00 local`.
 *  - Los atajos calculan rangos sobre meses naturales completos para que el
 *    parte mensual sea reproducible mes a mes.
 */

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

export type DateRange = {
  /** Fecha de inicio inclusive, formato yyyy-mm-dd. */
  from: string;
  /** Fecha fin inclusive, formato yyyy-mm-dd. */
  to: string;
  /** ISO timestamp del inicio del rango (00:00 local del día `from`). */
  startIso: string;
  /** ISO timestamp del primer instante FUERA del rango (00:00 local del día siguiente a `to`). */
  endIso: string;
  /** Etiqueta legible para mostrar al usuario. */
  label: string;
  /** Slug compacto para nombres de archivo. */
  slug: string;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const parts = s.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y === undefined || m === undefined || d === undefined) return false;
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

function parseYmd(s: string): Date {
  const parts = s.split("-").map(Number);
  // Asume formato pre-validado con isValidYmd: si llega aquí algo distinto
  // de 3 números válidos, es un bug del caller, no input externo.
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildRange(from: Date, to: Date): DateRange {
  // Si llega invertido lo enderezamos para no devolver rangos vacíos.
  const [start, end] = from <= to ? [from, to] : [to, from];
  const startIso = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  ).toISOString();
  const endIso = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate() + 1,
  ).toISOString();
  return {
    from: ymd(start),
    to: ymd(end),
    startIso,
    endIso,
    label: rangeLabel(start, end),
    slug: rangeSlug(start, end),
  };
}

function rangeLabel(from: Date, to: Date): string {
  // Caso "mes natural completo": del 1 al último día.
  const lastDayOfMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0);
  if (
    from.getDate() === 1 &&
    from.getMonth() === to.getMonth() &&
    from.getFullYear() === to.getFullYear() &&
    isSameDay(to, lastDayOfMonth)
  ) {
    return `${MONTH_LABELS[from.getMonth()] ?? ""} ${from.getFullYear()}`;
  }
  // Mismo año, dos meses naturales completos consecutivos no nos los
  // detallamos: tratamos cualquier otra cosa como rango libre.
  const fmt = (d: Date) =>
    `${pad(d.getDate())} ${(MONTH_LABELS[d.getMonth()] ?? "").slice(0, 3)} ${d.getFullYear()}`;
  return `${fmt(from)} – ${fmt(to)}`;
}

function rangeSlug(from: Date, to: Date): string {
  return `${ymd(from)}_${ymd(to)}`;
}

/** Mes natural en curso (día 1 → último día del mes actual). */
export function thisMonthRange(now = new Date()): DateRange {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return buildRange(from, to);
}

/** Mes natural anterior completo. */
export function lastMonthRange(now = new Date()): DateRange {
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0);
  return buildRange(from, to);
}

/**
 * "Último trimestre": los 3 meses naturales completos anteriores al actual.
 * Si hoy es 21-may-2026 → desde 1-feb-2026 hasta 30-abr-2026. Pensado para
 * "ver lo del trimestre cerrado" para reporting.
 */
export function lastQuarterRange(now = new Date()): DateRange {
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0);
  return buildRange(from, to);
}

/**
 * Parsea los query params `from` y `to` (yyyy-mm-dd). Si faltan, son
 * inválidos o vienen invertidos (`from > to`), cae al mes en curso. Sin
 * sorpresas: el manager siempre tiene un rango definido y bien orientado.
 *
 * La UI (`RangePicker`) nunca produce rangos invertidos — la validación
 * defensiva es solo para URLs escritas a mano o copy/paste.
 */
export function parseRange(
  fromParam: string | null | undefined,
  toParam: string | null | undefined,
  now = new Date(),
): DateRange {
  if (fromParam && toParam && isValidYmd(fromParam) && isValidYmd(toParam)) {
    const from = parseYmd(fromParam);
    const to = parseYmd(toParam);
    if (from > to) {
      // Antes invertíamos silenciosamente en buildRange — confundía al
      // usuario porque la etiqueta no coincidía con lo que había escrito.
      // Mejor caer al mes actual y que vuelva a elegir.
      return thisMonthRange(now);
    }
    return buildRange(from, to);
  }
  return thisMonthRange(now);
}

/**
 * Atajos pre-calculados listos para alimentar a un selector cliente. Devuelven
 * solo los datos serializables (no objetos `Date`), lo que evita errores de
 * "cannot be passed to client components".
 */
export type ShortcutDescriptor = {
  key: string;
  label: string;
  from: string;
  to: string;
  rangeLabel: string;
};

export function defaultShortcuts(now = new Date()): ShortcutDescriptor[] {
  const m = thisMonthRange(now);
  const lm = lastMonthRange(now);
  const lq = lastQuarterRange(now);
  return [
    { key: "this-month", label: "Mes actual", from: m.from, to: m.to, rangeLabel: m.label },
    { key: "last-month", label: "Mes pasado", from: lm.from, to: lm.to, rangeLabel: lm.label },
    {
      key: "last-quarter",
      label: "Último trimestre",
      from: lq.from,
      to: lq.to,
      rangeLabel: lq.label,
    },
  ];
}

/** Devuelve true si el rango cubre exactamente un único mes natural completo. */
export function isFullNaturalMonth(range: DateRange): boolean {
  const a = range.from.split("-").map(Number);
  const b = range.to.split("-").map(Number);
  const y = a[0];
  const m = a[1];
  const d = a[2];
  const y2 = b[0];
  const m2 = b[1];
  const d2 = b[2];
  if (
    y === undefined ||
    m === undefined ||
    d === undefined ||
    y2 === undefined ||
    m2 === undefined ||
    d2 === undefined
  ) {
    return false;
  }
  if (y !== y2 || m !== m2 || d !== 1) return false;
  const lastDay = new Date(y, m, 0).getDate();
  return d2 === lastDay;
}

/**
 * Dado un rango, devuelve el "rango anterior" que sirve de comparativa en
 * el parte mensual. Reglas:
 *   - Si el rango es un mes natural completo → devuelve el mes natural
 *     inmediatamente anterior. Ej: mayo 2026 → abril 2026.
 *   - Si es un rango libre → devuelve un rango de la misma duración que
 *     termina el día anterior a `range.from`. Ej: 5 días desde 12-may
 *     hasta 16-may → 7-may hasta 11-may.
 */
export function previousMonthRange(range: DateRange): DateRange {
  const from = parseYmd(range.from);
  const to = parseYmd(range.to);
  if (isFullNaturalMonth(range)) {
    const prevFrom = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const prevTo = new Date(from.getFullYear(), from.getMonth(), 0);
    return buildRange(prevFrom, prevTo);
  }
  // Rango libre: N días anteriores con la misma longitud.
  const msDay = 24 * 60 * 60 * 1000;
  const lengthDays = Math.round((to.getTime() - from.getTime()) / msDay) + 1;
  const prevTo = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1);
  const prevFrom = new Date(
    prevTo.getFullYear(),
    prevTo.getMonth(),
    prevTo.getDate() - (lengthDays - 1),
  );
  return buildRange(prevFrom, prevTo);
}

/**
 * Bucketea ISO timestamps por mes natural y devuelve un array alineado a
 * `monthsBack` posiciones, ordenado del más antiguo (índice 0) al actual
 * (índice `monthsBack - 1`). Los timestamps fuera de la ventana se ignoran.
 *
 * Compartido por el dashboard del admin (`AreaChart` de reseñas por mes) y el
 * panel del comercial (`MonthBars` de su evolución). Es una función pura.
 */
export function bucketByMonth(
  timestamps: string[],
  monthsBack: number,
  now = new Date(),
): number[] {
  const buckets = new Array<number>(monthsBack).fill(0);
  const baseY = now.getFullYear();
  const baseM = now.getMonth();
  for (const t of timestamps) {
    const d = new Date(t);
    const monthsAgo = (baseY - d.getFullYear()) * 12 + (baseM - d.getMonth());
    if (monthsAgo >= 0 && monthsAgo < monthsBack) {
      const idx = monthsBack - 1 - monthsAgo;
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
  }
  return buckets;
}

/** Componentes año/mes del rango (útiles para etiquetas legibles). */
export function rangeYearMonth(range: DateRange): { year: number; monthIndex: number; monthLabel: string } {
  const parts = range.from.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  return { year: y, monthIndex: m - 1, monthLabel: MONTH_LABELS[m - 1] ?? "" };
}
