/**
 * Helpers puros (sin I/O) que orquestan el export Excel "Parte semanal de
 * Raquel". Se invocan desde `app/api/export/reviews/route.ts` con los datos
 * ya cargados de Supabase; aquí solo agrupamos, contamos y formateamos.
 *
 * Mantener este módulo SIN side effects facilita el testing y evita que el
 * route handler quede 1500 líneas.
 */

import type { PauseReason, SalesDepartment } from "@/lib/supabase/types";

export const DEPARTMENT_ORDER: SalesDepartment[] = [
  "nacional",
  "internacional",
  "castellon",
  "valencia",
];

export const DEPARTMENT_LABEL: Record<SalesDepartment, string> = {
  nacional: "NACIONAL",
  internacional: "INTERNACIONAL",
  castellon: "CASTELLÓN",
  valencia: "VALENCIA",
};

export const PAUSE_REASON_LABEL: Record<PauseReason, string> = {
  vacaciones: "Vacaciones",
  baja_medica: "Baja médica",
  permiso_laboral: "Permiso laboral",
};

export type SalesForReport = {
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
  location_name: string | null;
  /** "sales" o "office_director" — los directores producen también y se
   *  marcan con prefijo "★" en su fila del Excel para distinguirlos. */
  role: "sales" | "office_director";
};

export type LocationForReport = {
  id: string;
  name: string;
  total_review_count: number | null;
  average_rating: number | null;
};

export type ReviewForReport = {
  id: string;
  sales_id: string | null;
  location_id: string;
  match_state: "counted" | "pending" | "unmatched";
  google_created_at: string;
};

/**
 * Agrupa comerciales activos+pausados+invitados por departamento. Los
 * archivados se excluyen (entran en "RESEÑAS BAJAS COMERCIALES" como una
 * sola fila agregada). Los profiles sin department asignado quedan fuera
 * del parte — el admin debe asignarlo desde /comerciales/[slug].
 */
export function groupActiveSalesByDepartment(
  sales: SalesForReport[],
): Record<SalesDepartment, SalesForReport[]> {
  const buckets: Record<SalesDepartment, SalesForReport[]> = {
    nacional: [],
    internacional: [],
    castellon: [],
    valencia: [],
  };
  for (const s of sales) {
    if (s.status === "archived" || !s.department) continue;
    buckets[s.department].push(s);
  }
  // Orden estable: por zona (ficha o idioma), luego por nombre.
  for (const d of DEPARTMENT_ORDER) {
    buckets[d].sort((a, b) => {
      const za = zoneFor(a).toLocaleLowerCase("es");
      const zb = zoneFor(b).toLocaleLowerCase("es");
      if (za !== zb) return za.localeCompare(zb, "es");
      return a.full_name.localeCompare(b.full_name, "es");
    });
  }
  return buckets;
}

/**
 * Devuelve el texto que aparece en la columna "ZONA" del parte:
 *   - internacional → idioma del comercial (Inglés/Nórdico, Rumano…)
 *   - nacional / castellon / valencia → nombre de la ficha asignada
 */
export function zoneFor(s: SalesForReport): string {
  if (s.department === "internacional") return s.language ?? "—";
  return s.location_name ?? "—";
}

/** Cuenta reseñas counted atribuidas a un comercial concreto. */
export function countedFor(reviews: ReviewForReport[], salesId: string): number {
  let n = 0;
  for (const r of reviews) {
    if (r.match_state === "counted" && r.sales_id === salesId) n++;
  }
  return n;
}

/**
 * Reseñas atribuidas en el periodo a comerciales que ya no están activos
 * (status='archived'), agrupadas por su departamento — alimenta la fila
 * "RESEÑAS BAJAS COMERCIALES" de cada hoja.
 */
export function archivedTotals(
  reviews: ReviewForReport[],
  sales: SalesForReport[],
): Record<SalesDepartment, number> {
  const archivedById = new Map<string, SalesForReport>();
  for (const s of sales) {
    if (s.status === "archived") archivedById.set(s.id, s);
  }
  const totals: Record<SalesDepartment, number> = {
    nacional: 0,
    internacional: 0,
    castellon: 0,
    valencia: 0,
  };
  for (const r of reviews) {
    if (r.match_state !== "counted" || !r.sales_id) continue;
    const owner = archivedById.get(r.sales_id);
    if (!owner || !owner.department) continue;
    totals[owner.department]++;
  }
  return totals;
}

/**
 * Devuelve las fichas de Google que aplican a cada departamento, en orden.
 *
 * - nacional: las 5 fichas Inseryal (Oropesa + 4 Madrid). Las reseñas viven
 *   en la ficha de cada comercial; en el parte, cada ficha es un sub-bloque
 *   con su propia cabecera.
 * - internacional: solo Oropesa (todos los internacionales atribuyen ahí).
 * - castellon: solo la ficha que matchee "Castellón".
 * - valencia: solo la ficha que matchee "Valencia".
 *
 * El matching es por nombre (normalizado) porque no tenemos un campo
 * explícito que vincule ficha ↔ departamento. Si en el futuro hay más
 * fichas, conviene añadir un campo `locations.department` opcional.
 */
export function locationsForDepartment(
  department: SalesDepartment,
  locations: LocationForReport[],
  activeSales: SalesForReport[],
): LocationForReport[] {
  const norm = (s: string) =>
    s.toLocaleLowerCase("es").normalize("NFD").replace(/\p{Diacritic}/gu, "");

  // Sets de ficha que tocan al departamento, derivados de:
  //  (a) location_id de los comerciales activos de ese departamento.
  //  (b) heurística por nombre (para garantizar que las 5 fichas Inseryal
  //      caen en NACIONAL aunque no haya comercial asignado).
  const usedLocationIds = new Set<string>();
  for (const s of activeSales) {
    if (s.department === department && s.location_id) {
      usedLocationIds.add(s.location_id);
    }
  }

  const result: LocationForReport[] = [];
  for (const loc of locations) {
    const name = norm(loc.name);
    let belongs = false;
    if (department === "nacional") {
      // Las fichas Inseryal son nacionales. Internacional comparte Oropesa
      // pero la quitamos abajo: si una ficha es Oropesa y hay comerciales
      // internacionales que la usan, también aparece como cabecera en
      // internacional (es la única que tiene de hecho). Aquí incluimos
      // todas las Inseryal excepto si Oropesa la usa el internacional
      // exclusivamente — caso muy borde.
      belongs = name.includes("inseryal");
    } else if (department === "internacional") {
      belongs = name.includes("oropesa");
    } else if (department === "castellon") {
      belongs = name.includes("castell");
    } else if (department === "valencia") {
      belongs = name.includes("valencia");
    }
    if (belongs || usedLocationIds.has(loc.id)) result.push(loc);
  }

  // Estabilidad: orden alfabético dentro del departamento. Salvo en
  // nacional, donde queremos que Oropesa salga primero si está presente.
  result.sort((a, b) => {
    if (department === "nacional") {
      const ao = norm(a.name).includes("oropesa") ? 0 : 1;
      const bo = norm(b.name).includes("oropesa") ? 0 : 1;
      if (ao !== bo) return ao - bo;
    }
    return a.name.localeCompare(b.name, "es");
  });
  return result;
}

/**
 * Formatea la cabecera de cada bloque de ficha:
 *   "RESEÑAS: <nombre>: <N> RESEÑAS ACUMULADAS. VALORACIÓN: X,Y PUNTOS DE 5"
 * Si no hay datos cacheados, devuelve un placeholder más sobrio.
 */
export function formatRatingHeader(loc: LocationForReport): string {
  if (loc.total_review_count === null || loc.average_rating === null) {
    return `RESEÑAS: ${loc.name}: pendiente de configurar valoración acumulada`;
  }
  const total = loc.total_review_count.toLocaleString("es-ES");
  const avg = loc.average_rating.toFixed(1).replace(".", ",");
  return `RESEÑAS: ${loc.name}: ${total} RESEÑAS ACUMULADAS. VALORACIÓN: ${avg} PUNTOS DE 5`;
}

/** "12 de marzo del 2026" — usada en la línea de PARTE SEMANAL. */
export function formatLongSpanishDate(d: Date): string {
  const months = [
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
  return `${d.getDate()} de ${months[d.getMonth()]} del ${d.getFullYear()}`;
}

/** "MARZO" en mayúsculas para la línea "<MES> DEL <AÑO>". */
export function formatUpperMonth(monthIndex: number): string {
  const months = [
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
  ];
  return months[monthIndex] ?? "";
}

/** "Marzo" con primera mayúscula (cabecera de columna RESEÑAS <MES>). */
export function formatMonthHeader(monthIndex: number): string {
  const months = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  return months[monthIndex] ?? "";
}

/** Nota inline a la altura del comercial — combina paused_reason + notes. */
export function inlineNote(s: SalesForReport): string {
  const parts: string[] = [];
  if (s.status === "paused" && s.paused_reason) {
    parts.push(PAUSE_REASON_LABEL[s.paused_reason]);
  }
  if (s.notes) parts.push(s.notes);
  return parts.join(" · ");
}

/** "13 de marzo del 2026" → solo día/mes para la columna fecha incorporación. */
export function formatShortJoinedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
