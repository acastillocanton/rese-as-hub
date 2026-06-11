/**
 * Horario de atención del equipo de soporte (informativo, §4.45).
 *
 * Septiembre–junio: lunes a viernes, 9:00–14:00 y 15:00–18:00.
 * Julio y agosto: horario intensivo, lunes a viernes de 8:00 a 15:00.
 *
 * Se muestra SOLO el horario del mes en curso (decisión de producto):
 * el aviso es para gestionar expectativas de respuesta hoy, no un
 * calendario anual.
 */

const MADRID_MONTH_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Madrid",
  month: "numeric",
});

/** Mes 1-12 en la zona horaria de Madrid (Vercel corre en UTC). */
export function madridMonth(now: Date): number {
  return Number(MADRID_MONTH_FMT.format(now));
}

/** Julio (7) y agosto (8) → horario intensivo de verano. */
export function isIntensiveMonth(month: number): boolean {
  return month === 7 || month === 8;
}

/** Texto del aviso con el horario vigente en el mes actual. */
export function getSupportHoursNotice(now: Date): string {
  return isIntensiveMonth(madridMonth(now))
    ? "Horario de atención (intensivo de verano): lunes a viernes de 8:00 a 15:00."
    : "Horario de atención: lunes a viernes de 9:00 a 14:00 y de 15:00 a 18:00.";
}
