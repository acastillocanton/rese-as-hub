type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
};

export function Sparkline({
  data,
  width = 120,
  height = 32,
  stroke = "var(--ink-2)",
}: SparklineProps) {
  if (data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return [x, y] as const;
  });
  const d = pts
    .map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ");
  const last = pts[pts.length - 1];
  if (!last) return null;
  return (
    <svg width={width} height={height} role="img" aria-label="tendencia">
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={stroke} />
    </svg>
  );
}
