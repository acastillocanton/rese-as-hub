import type { PauseReason, ProfileStatus, SalesDepartment } from "@/lib/supabase/types";

/**
 * Opciones de UI compartidas por los formularios de comerciales y directores
 * (Invite* y *EditCard). Antes estaban duplicadas en cada componente.
 */

export const DEPARTMENT_OPTIONS: { value: SalesDepartment; label: string }[] = [
  { value: "nacional", label: "Nacional" },
  { value: "internacional", label: "Internacional" },
  { value: "castellon", label: "Castellón" },
  { value: "valencia", label: "Valencia" },
];

// 'archived' no se gestiona desde los formularios de edición (lo hacen los
// botones de archivar/restaurar dedicados).
export const STATUS_OPTIONS: { value: Exclude<ProfileStatus, "archived">; label: string }[] = [
  { value: "invited", label: "Invitado (no ha entrado)" },
  { value: "active", label: "Activo" },
  { value: "paused", label: "Pausado" },
];

export const PAUSE_REASON_OPTIONS: { value: PauseReason; label: string }[] = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "baja_medica", label: "Baja médica" },
  { value: "permiso_laboral", label: "Permiso laboral" },
];
