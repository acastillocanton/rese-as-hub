import type { ReactNode } from "react";
import { DateRange } from "@/components/ui/DateRange";

type TopbarProps = {
  title: string;
  subtitle?: string;
  /** Etiqueta del rango. Pasa `null` para ocultar el badge (útil cuando el
   *  llamante mete su propio selector funcional en `right`). */
  range?: string | null;
  right?: ReactNode;
  breadcrumb?: string;
};

export function Topbar({
  title,
  subtitle,
  range = "Este mes",
  right,
  breadcrumb = "Grupo",
}: TopbarProps) {
  return (
    <header
      style={{
        padding: "18px 32px 14px",
        borderBottom: "1px solid var(--line)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        background: "var(--bg)",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "var(--ink-4)",
            fontSize: 12,
            letterSpacing: "-0.005em",
          }}
        >
          <span>{breadcrumb}</span>
          <span style={{ opacity: 0.5 }}>›</span>
          <span>{title}</span>
        </div>
        <h1
          style={{
            margin: "4px 0 0",
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.025em",
          }}
        >
          {subtitle || title}
        </h1>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {range !== null && <DateRange value={range} />}
        {right}
      </div>
    </header>
  );
}
