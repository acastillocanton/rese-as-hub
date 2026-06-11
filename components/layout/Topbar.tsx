import type { ReactNode } from "react";
import Link from "next/link";
import { DateRange } from "@/components/ui/DateRange";

type TopbarProps = {
  title: string;
  subtitle?: string;
  /** Etiqueta del rango. Pasa `null` para ocultar el badge (útil cuando el
   *  llamante mete su propio selector funcional en `right`). */
  range?: string | null;
  right?: ReactNode;
  breadcrumb?: string;
  /** Si está, el breadcrumb se renderiza como `<Link>` (vuelve a la sección
   *  padre). Solo lo pasan sub-páginas: /comerciales/[slug], /directores/[slug],
   *  /clientes/[slug], /panel/enlace, /panel/ranking, /panel/resenas, etc. */
  breadcrumbHref?: string;
  /** Cuando es `true`, aplica la clase `m-topbar-compact` que en
   *  mobile (≤767px) reduce paddings, achica el título y oculta el
   *  breadcrumb. Lo usan páginas con vista mobile (rol sales y
   *  office_director). En desktop no tiene efecto visible. */
  compact?: boolean;
};

export function Topbar({
  title,
  subtitle,
  range = "Este mes",
  right,
  breadcrumb = "Grupo",
  breadcrumbHref,
  compact = false,
}: TopbarProps) {
  return (
    <header
      className={compact ? "m-topbar-compact" : undefined}
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
          className={compact ? "m-topbar-breadcrumb" : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "var(--ink-4)",
            fontSize: 12,
            letterSpacing: "-0.005em",
          }}
        >
          {breadcrumbHref ? (
            <Link
              href={breadcrumbHref}
              style={{
                color: "inherit",
                textDecoration: "none",
                borderRadius: 2,
              }}
              className="topbar-breadcrumb-link"
            >
              {breadcrumb}
            </Link>
          ) : (
            <span>{breadcrumb}</span>
          )}
          <span style={{ opacity: 0.5 }}>›</span>
          <span>{title}</span>
        </div>
        <h1
          className={compact ? "m-topbar-title" : undefined}
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
      <div
        className={compact ? "m-topbar-right" : undefined}
        style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}
      >
        {range !== null && <DateRange value={range} />}
        {right}
      </div>
    </header>
  );
}
