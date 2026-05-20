type StarsProps = {
  value?: number;
  size?: number;
  color?: string;
  muted?: string;
};

export function Stars({
  value = 5,
  size = 12,
  color = "var(--ink-2)",
  muted = "var(--line-strong)",
}: StarsProps) {
  return (
    <span
      aria-label={`${value} de 5 estrellas`}
      style={{ display: "inline-flex", gap: 1 }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            fontSize: size,
            color: i <= value ? color : muted,
            lineHeight: 1,
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}
