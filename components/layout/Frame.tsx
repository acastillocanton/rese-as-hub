import type { ReactNode } from "react";

export function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--ink)",
        display: "flex",
        fontFamily: "var(--font-text)",
        letterSpacing: "-0.01em",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
