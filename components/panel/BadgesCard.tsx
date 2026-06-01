import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { PanelBadge } from "@/lib/panel-badges";

/**
 * Card "Tus insignias" del panel del comercial. Pinta las conseguidas primero
 * (grid responsive) y luego las que quedan por desbloquear (atenuadas). Las
 * insignias se calculan al vuelo en `lib/panel-badges.ts` — sin tabla.
 */
export function BadgesCard({ badges }: { badges: PanelBadge[] }) {
  // Conseguidas primero, manteniendo el orden de definición dentro de cada grupo.
  const sorted = [...badges].sort(
    (a, b) => Number(b.earned) - Number(a.earned),
  );
  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <Card padding={24}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
            Tus insignias
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              marginTop: 4,
              letterSpacing: "-0.02em",
            }}
          >
            Logros conseguidos
          </div>
        </div>
        <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
          {earnedCount} de {badges.length} desbloqueadas
        </span>
      </div>

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        {sorted.map((b) => (
          <Badge key={b.id} badge={b} />
        ))}
      </div>
    </Card>
  );
}
