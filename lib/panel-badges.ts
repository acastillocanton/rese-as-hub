/**
 * Insignias del panel del comercial — CALCULADAS AL VUELO.
 *
 * No hay tabla `achievements` ni estado persistido: cada insignia se deriva en
 * cada carga del panel desde datos que ya cargamos para otros widgets (reseñas
 * verificadas históricas, objetivo mensual, posición en el ranking del equipo).
 * Decisión de producto: mantenerlo sin migración ni infra extra. Si en el
 * futuro se quiere "fecha de desbloqueo" o notificación al ganarlas, habría que
 * persistir (tabla + migración, "Ask first").
 *
 * `computePanelBadges` es una función PURA → testeable en
 * `lib/__tests__/panel-badges.test.ts`. El componente `components/ui/Badge.tsx`
 * mapea cada `icon` a un icono de lucide y pinta conseguidas vs bloqueadas.
 */

export type BadgeIcon =
  | "target"
  | "crown"
  | "medal"
  | "milestone"
  | "star"
  | "flame";

export type PanelBadge = {
  id: string;
  label: string;
  description: string;
  icon: BadgeIcon;
  earned: boolean;
};

export type PanelBadgesInput = {
  /** Total histórico de reseñas counted, no-duplicadas, no-eliminadas. */
  lifetimeCounted: number;
  /** Reseñas del rango activo (las del hero del panel). */
  reviewsThisPeriod: number;
  /** Objetivo mensual del comercial (`profiles.monthly_goal`). */
  goal: number;
  /** Reseñas por mes de los últimos N meses (de `bucketByMonth`); el último
   *  índice es el mes en curso (parcial). */
  monthBuckets: number[];
  /** Nº de reseñas de 5★ histórico (counted, no-duplicadas). */
  fiveStarCount: number;
  /** Índice 0-based del comercial en el ranking de su equipo; null si no tiene
   *  equipo o no aparece. */
  rankIndex: number | null;
  /** Tamaño del equipo (incluyéndose). */
  teamSize: number;
};

/** Umbrales de las insignias de volumen acumulado. */
export const VOLUME_TIERS = [10, 25, 50, 100] as const;
/** Umbrales de la insignia "coleccionista de 5★". */
export const FIVE_STAR_TIERS = [10, 25] as const;

/**
 * Racha de meses consecutivos cumpliendo el objetivo, contando hacia atrás.
 * El último bucket es el mes EN CURSO (parcial): solo suma si ya alcanzó el
 * objetivo; si aún no, se ignora (no rompe la racha de meses completados).
 */
export function trailingStreak(monthBuckets: number[], goal: number): number {
  if (goal <= 0 || monthBuckets.length === 0) return 0;
  const lastIdx = monthBuckets.length - 1;
  const startIdx = (monthBuckets[lastIdx] ?? 0) >= goal ? lastIdx : lastIdx - 1;
  let streak = 0;
  for (let i = startIdx; i >= 0; i--) {
    if ((monthBuckets[i] ?? 0) >= goal) streak++;
    else break;
  }
  return streak;
}

export function computePanelBadges(input: PanelBadgesInput): PanelBadge[] {
  const {
    lifetimeCounted,
    reviewsThisPeriod,
    goal,
    monthBuckets,
    fiveStarCount,
    rankIndex,
    teamSize,
  } = input;

  const badges: PanelBadge[] = [];

  // ── Objetivo del mes ────────────────────────────────────────────────────
  const goalMet = goal > 0 && reviewsThisPeriod >= goal;
  badges.push({
    id: "monthly_goal",
    label: "Objetivo del mes",
    icon: "target",
    earned: goalMet,
    description: goalMet
      ? "Has alcanzado tu objetivo mensual de reseñas."
      : goal > 0
        ? `Te faltan ${goal - reviewsThisPeriod} reseñas para tu objetivo.`
        : "Aún no tienes objetivo mensual asignado.",
  });

  // ── Racha ───────────────────────────────────────────────────────────────
  const streak = trailingStreak(monthBuckets, goal);
  const streakEarned = streak >= 2;
  badges.push({
    id: "streak",
    label: "En racha",
    icon: "flame",
    earned: streakEarned,
    description: streakEarned
      ? `Llevas ${streak} meses seguidos cumpliendo el objetivo.`
      : "Cumple el objetivo 2 meses seguidos para desbloquearla.",
  });

  // ── Insignias de equipo (solo si hay equipo) ─────────────────────────────
  if (teamSize > 1) {
    const onPodium = rankIndex !== null && rankIndex < 3;
    badges.push({
      id: "podium",
      label: "Podio del equipo",
      icon: "medal",
      earned: onPodium,
      description: onPodium
        ? `Estás en el top 3 de tu equipo (puesto ${(rankIndex ?? 0) + 1}).`
        : "Entra en el top 3 de tu equipo para conseguirla.",
    });

    const isLeader = rankIndex === 0;
    badges.push({
      id: "leader",
      label: "Líder del equipo",
      icon: "crown",
      earned: isLeader,
      description: isLeader
        ? "Eres el nº 1 de tu equipo este periodo."
        : "Sé el nº 1 de tu equipo para conseguirla.",
    });
  }

  // ── Hitos de volumen ─────────────────────────────────────────────────────
  // Muestra las conseguidas + el siguiente umbral por alcanzar (no todas, para
  // no saturar el grid).
  let nextVolumeShown = false;
  for (const tier of VOLUME_TIERS) {
    if (lifetimeCounted >= tier) {
      badges.push({
        id: `volume_${tier}`,
        label: `${tier} reseñas`,
        icon: "milestone",
        earned: true,
        description: `Has acumulado ${tier} reseñas verificadas en total.`,
      });
    } else if (!nextVolumeShown) {
      badges.push({
        id: `volume_${tier}`,
        label: `${tier} reseñas`,
        icon: "milestone",
        earned: false,
        description: `Te faltan ${tier - lifetimeCounted} reseñas para este hito.`,
      });
      nextVolumeShown = true;
    }
  }

  // ── Coleccionista de 5★ ───────────────────────────────────────────────────
  let nextFiveStarShown = false;
  for (const tier of FIVE_STAR_TIERS) {
    if (fiveStarCount >= tier) {
      badges.push({
        id: `five_star_${tier}`,
        label: `${tier} de 5★`,
        icon: "star",
        earned: true,
        description: `Has conseguido ${tier} reseñas de 5 estrellas.`,
      });
    } else if (!nextFiveStarShown) {
      badges.push({
        id: `five_star_${tier}`,
        label: `${tier} de 5★`,
        icon: "star",
        earned: false,
        description: `Te faltan ${tier - fiveStarCount} reseñas de 5★ para este hito.`,
      });
      nextFiveStarShown = true;
    }
  }

  return badges;
}
