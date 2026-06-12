/**
 * Lógica pura del chequeo de salud diario (§ alertas de sistema).
 *
 * Cada `check*` recibe datos ya cargados (sin I/O) y devuelve `HealthFinding`s
 * cuando detecta una situación que merece avisar a los admins. El endpoint
 * `/api/cron/health-check` orquesta la carga y, si hay findings, manda UN
 * email-resumen (cadencia "solo si hay algo").
 *
 * Mantener este módulo sin I/O lo hace trivial de testear (igual que
 * `lib/cron/low-rating-alerts.ts`). Los umbrales se exportan para los tests.
 *
 * Lo que vigila (decidido con el usuario):
 *   1. Agente de deep-links parado / DOM de Maps roto (§4.54).
 *   2. Fichas de Google que dejaron de sincronizar o quedaron en error OAuth.
 *   3. Backlog de reseñas huérfanas recientes sin resolver.
 *   4. Emails de notificación a comerciales que fallaron y siguen sin reintentar.
 *
 * NO toca las alertas instantáneas ≤2★ (mig 017) — esas siguen igual.
 */

export type HealthSeverity = "warning" | "critical";

export type HealthFinding = {
  /** Identificador estable del tipo de incidencia. */
  id: string;
  severity: HealthSeverity;
  /** Título corto y humano. */
  title: string;
  /** Detalle con los números concretos. */
  detail: string;
  /** Link relativo a la app (el email lo prefija con appBase). */
  cta?: { label: string; href: string };
};

// ── Umbrales (exportados para los tests) ──

/** Sin latido del agente en > estas horas (con pendientes) → sospechoso.
 *  72h cubre un fin de semana largo con el PC de oficina apagado. */
export const HARVEST_NO_RUN_HOURS = 72;

/** El cron de sync corre cada hora (GitHub Action 06-23 UTC). 36h sin
 *  sincronizar una ficha conectada es claramente anómalo. */
export const LOCATION_SYNC_STALE_HOURS = 36;

/** Ventana para el backlog de huérfanas: solo cuentan las recientes, no las
 *  ~72 históricas de Places que nadie reclamará (§7). */
export const VERIFICATION_BACKLOG_WINDOW_DAYS = 30;

/** Nº de huérfanas recientes activas a partir del cual avisamos. */
export const VERIFICATION_BACKLOG_THRESHOLD = 15;

function hoursSince(iso: string, nowMs: number): number | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 3_600_000;
}

// ---------------------------------------------------------------------------
// 1. Agente de deep-links
// ---------------------------------------------------------------------------

/** Último latido del agente (`audit_log action='harvest_ran'`). `harvested`
 *  es el total de reseñas extraídas del DOM en esa pasada: 0 con pendientes
 *  pendientes = el módulo de reseñas de Maps no renderizó (DOM roto). */
export type HarvestHeartbeat = { createdAt: string; harvested: number } | null;

export function checkHarvestStalled(args: {
  lastRun: HarvestHeartbeat;
  /** Reseñas con google_maps_url IS NULL AND removed_at IS NULL (live). */
  pendingCount: number;
  nowMs: number;
}): HealthFinding | null {
  // Sin nada que cosechar no hay fallo posible (las ~15 anónimas/antiguas
  // irreparables no deben encender la alerta).
  if (args.pendingCount <= 0) return null;

  const cta = { label: "Ver enlaces pendientes", href: "/manager/resenas" };

  if (args.lastRun === null) {
    return {
      id: "harvest_no_heartbeat",
      severity: "warning",
      title: "El agente de enlaces no ha registrado ninguna pasada",
      detail: `Hay ${args.pendingCount} reseñas esperando enlace directo y no consta ninguna ejecución del agente. ¿Está encendido el PC de oficina y actualizado (git pull)?`,
      cta,
    };
  }

  const age = hoursSince(args.lastRun.createdAt, args.nowMs);

  if (age !== null && age > HARVEST_NO_RUN_HOURS) {
    return {
      id: "harvest_no_run",
      severity: "warning",
      title: "El agente de enlaces lleva días sin correr",
      detail: `Última pasada hace ${Math.round(age)} h y quedan ${args.pendingCount} reseñas sin enlace directo. Probablemente el PC de oficina está apagado o el agente se detuvo.`,
      cta,
    };
  }

  // Pasada reciente que extrajo 0 reseñas del DOM pese a haber pendientes:
  // síntoma de que Google cambió el DOM de Maps y la cosecha dejó de ver
  // las tarjetas de reseña (§4.54). Esto es lo "silencioso" que querías cazar.
  if (args.lastRun.harvested === 0) {
    return {
      id: "harvest_dom_broken",
      severity: "critical",
      title: "El agente no está cosechando enlaces (posible cambio de Google)",
      detail: `La última pasada del agente extrajo 0 reseñas pese a haber ${args.pendingCount} pendientes. Lo más probable es que Google haya cambiado el DOM de Maps y haya que ajustar los selectores del agente (§4.54).`,
      cta,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 2. Fichas sin sincronizar
// ---------------------------------------------------------------------------

export type LocationSyncLite = {
  id: string;
  name: string;
  oauthStatus: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

export function checkLocationsSyncStale(args: {
  locations: LocationSyncLite[];
  nowMs: number;
}): HealthFinding[] {
  const out: HealthFinding[] = [];
  const cta = { label: "Revisar fichas", href: "/fichas" };

  for (const loc of args.locations) {
    // Solo nos importan las que deberían estar sincronizando por Business
    // Profile (fuente única going-forward, §4.50).
    if (loc.oauthStatus !== "connected") continue;

    if (loc.lastSyncError) {
      out.push({
        id: `location_sync_error:${loc.id}`,
        severity: "critical",
        title: `Error de sincronización en «${loc.name}»`,
        detail: `La última sincronización de la ficha falló: ${loc.lastSyncError}`,
        cta,
      });
      continue;
    }

    const age = loc.lastSyncAt ? hoursSince(loc.lastSyncAt, args.nowMs) : null;
    if (loc.lastSyncAt === null || (age !== null && age > LOCATION_SYNC_STALE_HOURS)) {
      out.push({
        id: `location_sync_stale:${loc.id}`,
        severity: "warning",
        title: `«${loc.name}» lleva sin sincronizar`,
        detail:
          loc.lastSyncAt === null
            ? `La ficha está conectada pero nunca ha sincronizado.`
            : `Última sincronización hace ${Math.round(age!)} h (el cron debería correr cada hora).`,
        cta,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// 3. Backlog de verificación
// ---------------------------------------------------------------------------

export function checkVerificationBacklog(args: {
  /** unmatched + activas + google_created_at en la ventana reciente. */
  recentUnmatchedCount: number;
}): HealthFinding | null {
  if (args.recentUnmatchedCount <= VERIFICATION_BACKLOG_THRESHOLD) return null;
  return {
    id: "verification_backlog",
    severity: "warning",
    title: "Se acumulan reseñas sin atribuir",
    detail: `Hay ${args.recentUnmatchedCount} reseñas huérfanas de los últimos ${VERIFICATION_BACKLOG_WINDOW_DAYS} días sin resolver en la bandeja de verificación.`,
    cta: { label: "Ir a verificación", href: "/resenas/verificacion?state=unmatched" },
  };
}

// ---------------------------------------------------------------------------
// 4. Emails de notificación fallidos
// ---------------------------------------------------------------------------

export function checkFailedNotifications(args: {
  /** notify_failed sin un notify_retry_ok posterior. */
  failedCount: number;
}): HealthFinding | null {
  if (args.failedCount <= 0) return null;
  return {
    id: "notify_failed",
    severity: "warning",
    title: "Notificaciones a comerciales sin entregar",
    detail: `${args.failedCount} email(s) de aviso de reseña nueva fallaron al enviarse y siguen sin reintentar. Se pueden reenviar desde el endpoint admin de reintento (POST /api/admin/notify-failed).`,
  };
}

// ---------------------------------------------------------------------------
// Orden de presentación: critical primero, luego por id estable.
// ---------------------------------------------------------------------------

export function sortFindings(findings: HealthFinding[]): HealthFinding[] {
  const rank = (s: HealthSeverity) => (s === "critical" ? 0 : 1);
  return [...findings].sort(
    (a, b) => rank(a.severity) - rank(b.severity) || a.id.localeCompare(b.id),
  );
}
