type DateRangeProps = {
  value?: string;
};

export function DateRange({ value = "Este mes" }: DateRangeProps) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 12px",
        background: "var(--surface)",
        border: "1px solid var(--line-strong)",
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      <span aria-hidden="true" style={{ color: "var(--ink-4)" }}>◴</span>
      <span>{value}</span>
      <span aria-hidden="true" style={{ color: "var(--ink-4)", marginLeft: 4, fontSize: 10 }}>
        ▾
      </span>
    </div>
  );
}
