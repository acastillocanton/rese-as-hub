import Link from "next/link";
import type { CSSProperties } from "react";

type Props = {
  /** Página actual (1-based). */
  page: number;
  pageSize: number;
  /** Total de filas que casan con los filtros activos (no el global). */
  total: number;
  totalPages: number;
  /**
   * Constructor del href para una página concreta. El caller es dueño de la
   * ruta y de qué filtros preservar; este componente solo cambia `page`. Debe
   * arrastrar los filtros activos y omitir `page` cuando target === 1 (para
   * mantener URLs limpias). El reset a página 1 al cambiar de filtro lo
   * gestiona el caller (aquí solo se generan Prev/Next).
   */
  hrefForPage: (target: number) => string;
};

/**
 * Paginación reutilizable para listados server-rendered. Prev/Next como `<Link>`.
 * Agnóstica de ruta: el caller inyecta `hrefForPage`. Server component (sin
 * estado ni Supabase): recibe el total ya calculado.
 */
export function Pagination({ page, pageSize, total, totalPages, hrefForPage }: Props) {
  if (totalPages <= 1) return null;

  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 4px 4px",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
        {start}–{end} de {total} · Página {safePage} de {totalPages}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <PageLink href={hrefForPage(safePage - 1)} disabled={safePage <= 1} label="← Anterior" />
        <PageLink href={hrefForPage(safePage + 1)} disabled={safePage >= totalPages} label="Siguiente →" />
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: string;
}) {
  const style: CSSProperties = {
    padding: "6px 12px",
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    border: "1px solid var(--line-strong)",
    background: "var(--surface)",
    color: disabled ? "var(--ink-4)" : "var(--ink)",
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? "none" : "auto",
  };
  if (disabled)
    return (
      <span style={style} aria-disabled="true">
        {label}
      </span>
    );
  return (
    <Link href={href} style={style}>
      {label}
    </Link>
  );
}
