"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type GhostBtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  primary?: boolean;
};

export function GhostBtn({ children, primary, style, ...rest }: GhostBtnProps) {
  return (
    <button
      {...rest}
      style={{
        padding: "7px 12px",
        border: "1px solid var(--line-strong)",
        background: primary ? "var(--ink)" : "var(--surface)",
        color: primary ? "#fff" : "var(--ink)",
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
