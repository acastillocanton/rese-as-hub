import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

type PageLoadingShellProps = {
  /** Si true, oculta el header en mobile (rol con vista mobile) y deja el
   *  contenido con `m-page-pad`. Por defecto desktop-only. */
  compact?: boolean;
  /** Número de Card skeletons grandes a renderizar bajo el header. */
  cards?: number;
};

/**
 * Esqueleto reutilizable para `loading.tsx` por route group. Reproduce
 * visualmente el chrome de página (Topbar fake + Cards) sin queries.
 * Las animaciones shimmer respetan `prefers-reduced-motion` (ver globals.css).
 */
export function PageLoadingShell({ compact = false, cards = 3 }: PageLoadingShellProps) {
  return (
    <>
      <header
        className={compact ? "m-topbar-compact" : undefined}
        aria-busy="true"
        aria-label="Cargando"
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={compact ? "m-topbar-breadcrumb" : undefined}>
            <Skeleton width={110} height={11} radius={3} />
          </div>
          <div style={{ marginTop: 8 }} className={compact ? "m-topbar-title" : undefined}>
            <Skeleton width={220} height={26} radius={6} />
          </div>
        </div>
        <Skeleton width={140} height={32} radius={10} />
      </header>

      <div
        className="m-page-pad"
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {Array.from({ length: cards }).map((_, i) => (
          <Card key={i} padding={22}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Skeleton width={160} height={13} radius={4} />
              <Skeleton width={260} height={20} radius={6} />
              <div style={{ marginTop: 6 }}>
                <Skeleton width="100%" height={12} radius={4} />
              </div>
              <Skeleton width="80%" height={12} radius={4} />
              <Skeleton width="55%" height={12} radius={4} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
