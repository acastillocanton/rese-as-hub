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
        // OJO: sin overflow aquí. Un overflow != visible convertiría a Frame en
        // contenedor de scroll y rompería el `position: sticky` del sidebar
        // (se anclaría a Frame, que no scrollea, en vez de al documento). El
        // scroll horizontal de contenido ancho lo absorbe cada bloque (tablas
        // con overflowX:auto) + `minWidth:0` en <main>.
      }}
    >
      {children}
    </div>
  );
}
