type RingProps = {
  value: number;
  max: number;
  size?: number;
};

export function Ring({ value, max, size = 120 }: RingProps) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  return (
    <svg
      width={size}
      height={size}
      role="img"
      aria-label={`${Math.round(pct * 100)}% del objetivo`}
      style={{ display: "block" }}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E5EA" strokeWidth="6" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#1D1D1F"
        strokeWidth="6"
        strokeDasharray={`${c * pct} ${c}`}
        strokeDashoffset={c * 0.25}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{
          transform: `rotate(-90deg)`,
          transformOrigin: "center",
          strokeLinecap: "round",
        }}
      />
      <text
        x={size / 2}
        y={size / 2 - 2}
        textAnchor="middle"
        fontSize="22"
        fontWeight="600"
        fill="#1D1D1F"
        fontFamily="var(--font-display)"
        style={{ letterSpacing: "-0.02em" }}
      >
        {Math.round(pct * 100)}%
      </text>
      <text
        x={size / 2}
        y={size / 2 + 16}
        textAnchor="middle"
        fontSize="10.5"
        fill="#86868B"
        style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
      >
        objetivo
      </text>
    </svg>
  );
}
