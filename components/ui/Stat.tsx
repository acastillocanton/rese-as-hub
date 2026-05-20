import { Card } from "./Card";

type StatProps = {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  deltaTone?: "ok" | "warn" | "neutral";
  big?: boolean;
};

export function Stat({ label, value, sub, delta, deltaTone = "ok", big }: StatProps) {
  const toneColor =
    deltaTone === "ok"
      ? "var(--ok)"
      : deltaTone === "warn"
        ? "var(--warn)"
        : "var(--ink-3)";
  return (
    <Card>
      <div
        style={{
          fontSize: 12.5,
          color: "var(--ink-3)",
          fontWeight: 500,
          letterSpacing: "-0.005em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          letterSpacing: "-0.03em",
          fontSize: big ? 38 : 32,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        {sub && <div style={{ fontSize: 12, color: "var(--ink-4)" }}>{sub}</div>}
        {delta && (
          <div
            style={{
              fontSize: 12,
              color: toneColor,
              fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {delta}
          </div>
        )}
      </div>
    </Card>
  );
}
