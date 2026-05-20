type ProgressProps = {
  value: number;
  max?: number;
  height?: number;
  tone?: "ink" | "ok";
};

export function Progress({ value, max = 100, height = 4, tone = "ink" }: ProgressProps) {
  const pct = Math.min(100, (value / max) * 100);
  const fg = tone === "ok" ? "var(--ok)" : "var(--ink)";
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      style={{ height, background: "#E5E5EA", borderRadius: 999, overflow: "hidden" }}
    >
      <div
        style={{
          width: pct + "%",
          height: "100%",
          background: fg,
          borderRadius: 999,
        }}
      />
    </div>
  );
}
