import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Sparkline } from "@/components/charts/Sparkline";
import type { LeaderboardRow } from "@/lib/leaderboard";

/**
 * Tabla del leaderboard. Compartida por:
 *   - `/dashboard` (Top 10 con `limit={10}`).
 *   - `/ranking` (lista completa, sin limit).
 *
 * Cada fila enlaza a `/comerciales/{slug}` (la pantalla de gestión y detalle
 * del productor, que ya acepta tanto sales como office_director).
 *
 * Componente puro server-side; no usa estado ni effects.
 */
export function LeaderboardTable({
  rows,
  limit,
}: {
  rows: LeaderboardRow[];
  limit?: number;
}) {
  const visible = typeof limit === "number" ? rows.slice(0, limit) : rows;

  return (
    <div style={{ padding: "4px 22px 14px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1.6fr 1fr 0.7fr 0.7fr 0.7fr 100px",
          gap: 14,
          padding: "8px 0",
          fontSize: 11,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <span>#</span>
        <span>Comercial</span>
        <span>Ficha</span>
        <span style={{ textAlign: "right" }}>Visitas</span>
        <span style={{ textAlign: "right" }}>Reseñas</span>
        <span style={{ textAlign: "right" }}>Conv.</span>
        <span style={{ textAlign: "right" }}>Tendencia</span>
      </div>
      {visible.map((p, i) => (
        <Link
          key={p.id}
          href={`/comerciales/${p.slug}`}
          style={{
            display: "grid",
            gridTemplateColumns: "28px 1.6fr 1fr 0.7fr 0.7fr 0.7fr 100px",
            gap: 14,
            padding: "12px 0",
            alignItems: "center",
            borderBottom:
              i === visible.length - 1 ? "none" : "1px solid var(--line)",
            fontSize: 13.5,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <span
            style={{
              fontVariantNumeric: "tabular-nums",
              color: i < 3 ? "var(--ink)" : "var(--ink-4)",
              fontWeight: i < 3 ? 600 : 500,
            }}
          >
            {(i + 1).toString().padStart(2, "0")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Avatar name={p.name} size={28} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {p.name}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                {p.isDirector ? "★ Director · " : ""}
                {p.status === "active"
                  ? "Activo"
                  : p.status === "paused"
                    ? "Pausado"
                    : "Invitado"}
                {" · meta "}
                {p.goal}
              </div>
            </div>
          </div>
          <span style={{ color: "var(--ink-3)", fontSize: 12.5 }}>{p.branch}</span>
          <span
            style={{
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              color: p.visits > 0 ? "var(--ink)" : "var(--ink-4)",
            }}
          >
            {p.visits}
          </span>
          <span
            style={{
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              fontWeight: 600,
              color: p.reviews > 0 ? "var(--ink)" : "var(--ink-4)",
            }}
          >
            {p.reviews}
          </span>
          <span
            style={{
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              color: "var(--ink-3)",
            }}
          >
            {p.visits > 0 ? `${p.conv}%` : "—"}
          </span>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Sparkline
              data={[0, 0, 0, 0, 0, p.visits]}
              width={84}
              height={22}
              stroke={p.visits > 0 ? "var(--ink-2)" : "#D6D6D9"}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}
