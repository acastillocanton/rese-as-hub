type MonthBarsProps = {
  data: number[];
  labels: string[];
  height?: number;
  highlight?: number | null;
};

export function MonthBars({ data, labels, height = 200, highlight = null }: MonthBarsProps) {
  const max = Math.max(...data, 1);
  return (
    <div
      role="img"
      aria-label="reseñas por mes"
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        height,
        padding: "0 4px",
      }}
    >
      {data.map((v, i) => {
        const h = (v / max) * (height - 28);
        const isHi = highlight === i;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                color: isHi ? "var(--ink)" : "var(--ink-4)",
                fontVariantNumeric: "tabular-nums",
                fontWeight: isHi ? 600 : 400,
              }}
            >
              {v}
            </div>
            <div
              style={{
                width: "100%",
                height: h,
                minHeight: 2,
                background: isHi ? "var(--ink)" : "#D6D6DB",
                borderRadius: 4,
                transition: "background .2s",
              }}
            />
            <div
              style={{
                fontSize: 10.5,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {labels[i]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
