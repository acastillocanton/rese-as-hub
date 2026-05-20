import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PillProps = {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn";
  withDot?: boolean;
};

export function Pill({ children, tone = "neutral", withDot = false }: PillProps) {
  const cls = cn("pill", tone === "ok" && "ok", tone === "warn" && "warn");
  return (
    <span className={cls}>
      {withDot && <span className="dot" />}
      {children}
    </span>
  );
}
