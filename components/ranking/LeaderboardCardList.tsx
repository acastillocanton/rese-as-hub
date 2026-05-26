import { Avatar } from "@/components/ui/Avatar";
import type { LeaderboardRow } from "@/lib/leaderboard";

/**
 * Renderizado mobile-first del leaderboard como lista de cards verticales.
 *
 * A diferencia de `LeaderboardTable` (grid 7 columnas, desktop), esta pinta
 * cada productor como una card apilada con un grid 2x2 de stats. La card
 * correspondiente al usuario actual (`row.isSelf`) se destaca con borde
 * tinta y un badge "Tú" en la esquina.
 *
 * Solo se usa en `/panel/ranking` (rol sales). No es responsive de la tabla:
 * son dos componentes paralelos por separación de responsabilidades.
 */
export function LeaderboardCardList({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {rows.map((p, i) => (
        <li key={p.id}>
          <article
            aria-current={p.isSelf ? "true" : undefined}
            style={{
              position: "relative",
              background: p.isSelf ? "var(--surface-2)" : "var(--surface)",
              border: p.isSelf
                ? "2px solid var(--ink)"
                : "1px solid var(--line)",
              borderRadius: "var(--radius)",
              padding: 16,
              boxShadow: "var(--shadow-card)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {p.isSelf && (
              <span
                aria-label="Tú"
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  background: "var(--ink)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: 999,
                }}
              >
                Tú
              </span>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 700,
                  fontSize: 18,
                  color: i < 3 ? "var(--ink)" : "var(--ink-4)",
                  minWidth: 26,
                }}
              >
                {(i + 1).toString().padStart(2, "0")}
              </span>
              <Avatar name={p.name} size={36} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    letterSpacing: "-0.01em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    paddingRight: p.isSelf ? 36 : 0,
                  }}
                >
                  {p.name}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-4)",
                    marginTop: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.isDirector ? "★ Director · " : ""}
                  {p.branch}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                paddingTop: 4,
              }}
            >
              <StatCell label="Reseñas" value={p.reviews} muted={p.reviews === 0} strong />
              <StatCell label="Meta" value={p.goal} muted={p.goal === 0} />
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}

function StatCell({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: number | string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--bg)",
        borderRadius: "var(--radius-sm)",
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 500,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontVariantNumeric: "tabular-nums",
          fontSize: 18,
          fontWeight: strong ? 700 : 600,
          color: muted ? "var(--ink-4)" : "var(--ink)",
          marginTop: 2,
          letterSpacing: "-0.015em",
        }}
      >
        {value}
      </div>
    </div>
  );
}
