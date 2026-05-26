import { Pill } from "@/components/ui/Pill";

/**
 * Badge "Duplicada" para reseñas marcadas anti-fraude (mig 015).
 *
 * Aparece junto al pill de match_state en los listados:
 *   - /panel/resenas (rol sales)
 *   - /manager/resenas
 *   - /resenas/verificacion
 *   - /comerciales/[slug] (dentro de la card de reseñas)
 *
 * No filtra nada — solo etiqueta visualmente. Las queries de KPI ya
 * excluyen `is_duplicate=true` (ver lib/leaderboard.ts, dashboard, etc).
 */
export function DuplicateBadge() {
  return (
    <span
      title="Esta reseña no cuenta para KPIs ni pago al comercial porque el cliente ya tenía otra reseña atribuida (la primera por fecha)."
      style={{ display: "inline-flex" }}
    >
      <Pill withDot tone="warn">
        Duplicada
      </Pill>
    </span>
  );
}
