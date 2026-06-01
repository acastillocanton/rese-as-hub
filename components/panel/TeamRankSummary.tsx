import Link from "next/link";
import { Card } from "@/components/ui/Card";

/**
 * Resumen compacto de la posición del comercial en el ranking de su equipo.
 * El detalle completo (lista de compañeros) vive en `/panel/ranking`; esto es
 * el teaser del panel. `rankIndex` es 0-based; null si no aparece en el equipo.
 */
export function TeamRankSummary({
  rankIndex,
  teamSize,
  hasDirector,
}: {
  rankIndex: number | null;
  teamSize: number;
  hasDirector: boolean;
}) {
  const position = rankIndex === null ? null : rankIndex + 1;
  const soloTeam = teamSize <= 1 || position === null;

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
        <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
          Ranking del equipo
        </div>
        {!soloTeam && (
          <Link
            href="/panel/ranking"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--ink-3)",
              textDecoration: "none",
            }}
          >
            Ver ranking →
          </Link>
        )}
      </div>

      {soloTeam ? (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 13.5,
            color: "var(--ink-4)",
            lineHeight: 1.55,
          }}
        >
          {hasDirector
            ? "Aún no tienes compañeros en tu equipo. En cuanto haya más comerciales asignados verás aquí tu posición."
            : "Aún no tienes equipo asignado. Tu posición aparecerá cuando te asignen un responsable."}
        </p>
      ) : (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 44,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            #{position}
          </span>
          <span style={{ fontSize: 15, color: "var(--ink-3)" }}>
            de {teamSize} en tu equipo
          </span>
          {position === 1 && (
            <span
              style={{
                background: "var(--ink)",
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                padding: "3px 9px",
                borderRadius: 999,
              }}
            >
              Líder
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
