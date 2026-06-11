import { Clock } from "lucide-react";
import { getSupportHoursNotice } from "@/lib/support-hours";

/**
 * Aviso informativo con el horario de atención del equipo de soporte.
 * Server-component-safe (sin hooks). Muestra solo el horario vigente
 * en el mes actual (intensivo en julio/agosto, partido el resto).
 */
export function SupportHoursNotice() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        fontSize: 12.5,
        color: "var(--ink-4)",
        lineHeight: 1.5,
      }}
    >
      <Clock size={13} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span>{getSupportHoursNotice(new Date())}</span>
    </div>
  );
}
