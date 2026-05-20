"use client";

type SegProps = {
  options: string[];
  value: string;
  onChange?: (next: string) => void;
};

export function Seg({ options, value, onChange }: SegProps) {
  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        padding: 2,
        background: "#EBEBF0",
        borderRadius: 9,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(o)}
            style={{
              padding: "5px 11px",
              borderRadius: 7,
              cursor: "pointer",
              background: active ? "var(--surface)" : "transparent",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              color: active ? "var(--ink)" : "var(--ink-3)",
              border: "none",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
