import { Award, Crown, Flame, Medal, Star, Target } from "lucide-react";
import type { BadgeIcon, PanelBadge } from "@/lib/panel-badges";

/**
 * Insignia/medalla del panel del comercial. Distinta del `Pill` genérico:
 * disco con icono + label + descripción corta. Dos estados visuales:
 *   • earned  — disco tinta, texto en negro, descripción visible.
 *   • locked  — disco/texto gris atenuado (insignia por conseguir).
 *
 * Server component-safe: sin hooks ni handlers. Mapea `badge.icon` (string del
 * helper puro `lib/panel-badges.ts`) a un icono de lucide.
 */

const ICONS: Record<BadgeIcon, typeof Award> = {
  target: Target,
  crown: Crown,
  medal: Medal,
  milestone: Award,
  star: Star,
  flame: Flame,
};

export function Badge({ badge }: { badge: PanelBadge }) {
  const Icon = ICONS[badge.icon] ?? Award;
  const { earned } = badge;

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "12px 14px",
        borderRadius: "var(--radius-sm)",
        border: earned ? "1px solid var(--line-strong)" : "1px solid var(--line)",
        background: earned ? "var(--surface)" : "var(--bg)",
        opacity: earned ? 1 : 0.62,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          background: earned ? "var(--ink)" : "var(--surface-2)",
          color: earned ? "#fff" : "var(--ink-4)",
        }}
      >
        <Icon size={18} strokeWidth={1.9} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: earned ? "var(--ink)" : "var(--ink-3)",
          }}
        >
          {badge.label}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--ink-4)",
            marginTop: 2,
            lineHeight: 1.45,
          }}
        >
          {badge.description}
        </div>
      </div>
    </div>
  );
}
