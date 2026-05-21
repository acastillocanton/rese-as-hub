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
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
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
    return `${MONTH_LABELS[from.getMonth()]} ${from.getFullYear()}`;
  }
  // Mismo año, dos meses naturales completos consecutivos no nos los
  // detallamos: tratamos cualquier otra cosa como rango libre.
  const fmt = (d: Date) =>
    `${pad(d.getDate())} ${MONTH_LABELS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
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
 * Parsea los query params `from` y `to` (yyyy-mm-dd). Si faltan o son
 * inválidos, cae al mes en curso. Sin sorpresas: el manager siempre tiene
 * un rango definido.
 */
export function parseRange(
  fromParam: string | null | undefined,
  toParam: string | null | undefined,
  now = new Date(),
): DateRange {
  if (fromParam && toParam && isValidYmd(fromParam) && isValidYmd(toParam)) {
    return buildRange(parseYmd(fromParam), parseYmd(toParam));
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
  const [y, m, d] = range.from.split("-").map(Number);
  const [y2, m2, d2] = range.to.split("-").map(Number);
  if (y !== y2 || m !== m2 || d !== 1) return false;
  const lastDay = new Date(y, m, 0).getDate();
  return d2 === lastDay;
}
