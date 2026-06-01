export type MotivationState = "done" | "on_track" | "behind";

// Día de la semana: 0=dom, 1=lun, 2=mar, 3=mié, 4=jue, 5=vie, 6=sáb

const BEHIND: string[] = [
  "El domingo es buen día para enviar tu enlace — tus clientes tienen más tiempo para leer.",
  "Empieza la semana con energía: contacta hoy a los clientes de la semana pasada.",
  "Martes: aún tienes toda la semana por delante para acercarte al objetivo.",
  "Mitad de semana — todavía puedes cerrar el mes con fuerza.",
  "Jueves: activa a los clientes pendientes antes de que llegue el fin de semana.",
  "Viernes: recuerda a los clientes que prometieron dejarte su reseña esta semana.",
  "Sábado activo: los clientes tienen más tiempo hoy para escribir su reseña.",
];

const ON_TRACK: string[] = [
  "¡Buen ritmo!",
  "Buen arranque de semana.",
  "Martes en positivo.",
  "Mitad de semana cubierta.",
  "Jueves en forma.",
  "Buena semana.",
  "Fin de semana productivo.",
];

const DONE: Array<(daysLeft: number) => string> = [
  (d) => `Aprovecha el domingo para seguir sumando — quedan ${d} días.`,
  (_d) => `Empieza la semana pensando ya en el mes que viene.`,
  (d) => `Quedan ${d} días — cada reseña extra es un bonus.`,
  (_d) => `Mitad de mes superada — mantén el ritmo.`,
  (d) => `Tienes ${d} días más para ampliar la ventaja.`,
  (d) => `Cierra el mes por todo lo alto — quedan ${d} días.`,
  (d) => `Quedan ${d} días — termina el mes redondo.`,
];

/**
 * Devuelve el sufijo motivacional del mensaje de objetivo en el panel.
 * - 'done'     → complemento de "Objetivo conseguido."
 * - 'on_track' → interjectivo entre "Faltan X reseñas en Y días." y "Con tu ritmo actual…"
 * - 'behind'   → cierre de "Faltan X reseñas en Y días."
 */
export function getMotivationSuffix(
  dayOfWeek: number,
  state: MotivationState,
  data: { daysLeft: number },
): string {
  const day = ((dayOfWeek % 7) + 7) % 7;
  if (state === "behind") return BEHIND[day] ?? BEHIND[0]!;
  if (state === "on_track") return ON_TRACK[day] ?? ON_TRACK[0]!;
  return (DONE[day] ?? DONE[0]!)(data.daysLeft);
}
