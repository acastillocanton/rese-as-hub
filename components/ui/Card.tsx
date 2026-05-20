import type { CSSProperties, ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  padding?: number;
  style?: CSSProperties;
  className?: string;
};

export function Card({ children, padding = 20, style, className }: CardProps) {
  return (
    <div
      className={className}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding,
        boxShadow: "var(--shadow-card)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
