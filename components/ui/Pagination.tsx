import Link from "next/link";
import type { CSSProperties } from "react";

type CurrentParams = {
  tab: "pending" | "answered";
  location_id: string | null;
  rating_lte: number | null;
  from: string | null;
  to: string | null;
};

type Props = {
  /** Página actual (1-based). */
  page: number;
  pageSize: number;
  /** Total de filas que casan con los filtros activos (no el global). */
  total: number;
  totalPages: number;
  /** Filtros activos a preservar en los links Prev/Next. */
  currentParams: CurrentParams;
};

/**
 * Paginación reutilizable para listados server-rendered. Prev/Next como `<Link>`;
 * preserva los filtros activos y SOLO cambia `page`. El reset a página 1 al
 * cambiar de filtro lo gestiona el caller (este componente no lo hace).
 * Server component (sin estado ni Supabase): recibe el total ya calculado.
 */
export function Pagination({ page, pageSize, total, totalPages, currentParams }: Props) {
  if (totalPages <= 1) return null;

  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  const href = (target: number) => {
    const sp = new URLSearchParams();
    sp.set("tab", currentParams.tab);
    if (currentParams.location_id) sp.set("location_id", currentParams.location_id);
    if (currentParams.rating_lte) sp.set("rating_lte", String(currentParams.rating_lte));
    if (currentParams.from && currentParams.to) {
      sp.set("from", currentParams.from);
      sp.set("to", currentParams.to);
    }
    if (target > 1) sp.set("page", String(target));
    return `/resenas/respuestas?${sp.toString()}`;
  };

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
        <PageLink href={href(safePage - 1)} disabled={safePage <= 1} label="← Anterior" />
        <PageLink href={href(safePage + 1)} disabled={safePage >= totalPages} label="Siguiente →" />
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
