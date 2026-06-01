import { Card } from "@/components/ui/Card";
import { MonthBars } from "@/components/charts/MonthBars";

/**
 * Card "Tu evolución" del panel del comercial: barras de reseñas verificadas
 * por mes (últimos N meses), con el mes en curso resaltado.
 */
export function MonthlyEvolutionCard({
  data,
  labels,
}: {
  data: number[];
  labels: string[];
}) {
  const total = data.reduce((s, v) => s + v, 0);
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
            Tu evolución
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              marginTop: 4,
              letterSpacing: "-0.02em",
            }}
          >
            Reseñas verificadas por mes
          </div>
        </div>
        <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
          {total} en los últimos {data.length} meses
        </span>
      </div>
      <div style={{ marginTop: 18 }}>
        <MonthBars
          data={data}
          labels={labels}
          height={200}
          highlight={data.length - 1}
        />
      </div>
    </Card>
  );
}
