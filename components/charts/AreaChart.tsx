type AreaChartProps = {
  /** Serie secundaria opcional (línea punteada). Si no se pasa, solo
   *  se pinta la serie principal `conseguidos`. */
  enviados?: number[];
  conseguidos: number[];
  labels: string[];
  height?: number;
};

export function AreaChart({ enviados, conseguidos, labels, height = 210 }: AreaChartProps) {
  const w = 760;
  const h = height;
  const padL = 28;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const enviadosSafe = enviados ?? [];
  const max = Math.max(...enviadosSafe, ...conseguidos, 1);
  const niceMax = Math.ceil(max / 10) * 10;
  const xOf = (i: number) =>
    padL + (i / Math.max(1, conseguidos.length - 1)) * innerW;
  const yOf = (v: number) => padT + innerH - (v / niceMax) * innerH;
  const path = (arr: number[]) =>
    arr.map((v, i) => (i ? "L" : "M") + xOf(i).toFixed(1) + " " + yOf(v).toFixed(1)).join(" ");
  const area = (arr: number[]) =>
    path(arr) + ` L ${xOf(arr.length - 1)} ${padT + innerH} L ${xOf(0)} ${padT + innerH} Z`;
  const ticks = [0, niceMax / 2, niceMax];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="enlaces enviados vs reseñas verificadas"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <linearGradient id="g-cons" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1D1D1F" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#1D1D1F" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={w - padR}
            y1={yOf(t)}
            y2={yOf(t)}
            stroke="#E5E5EA"
            strokeDasharray="2 4"
          />
          <text
            x={padL - 8}
            y={yOf(t) + 3}
            textAnchor="end"
            fontSize="10"
            fill="#86868B"
            fontFamily="var(--font-mono)"
          >
            {t}
          </text>
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={i} x={xOf(i)} y={h - 6} textAnchor="middle" fontSize="10" fill="#86868B">
          {l}
        </text>
      ))}
      <path d={area(conseguidos)} fill="url(#g-cons)" />
      {enviadosSafe.length > 0 && (
        <path
          d={path(enviadosSafe)}
          fill="none"
          stroke="#AEAEB2"
          strokeWidth="1.3"
          strokeDasharray="3 3"
        />
      )}
      <path d={path(conseguidos)} fill="none" stroke="#1D1D1F" strokeWidth="1.6" />
      {conseguidos.map((v, i) => (
        <circle key={i} cx={xOf(i)} cy={yOf(v)} r="2.5" fill="#1D1D1F" />
      ))}
    </svg>
  );
}
