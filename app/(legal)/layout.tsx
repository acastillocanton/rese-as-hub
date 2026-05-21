import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--ink)",
        fontFamily: "var(--font-text)",
        padding: "56px 24px 80px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <article
        style={{
          width: "100%",
          maxWidth: 720,
        }}
      >
        <header style={{ marginBottom: 36, paddingBottom: 24, borderBottom: "1px solid var(--line)" }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              color: "var(--ink)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "#1D1D1F",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              r
            </div>
            <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.015em" }}>
              ReseñaHub
            </span>
            <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
              · Inseryal by Marina d&apos;Or
            </span>
          </Link>
        </header>

        <div
          role="status"
          style={{
            padding: "10px 14px",
            background: "var(--warn-bg)",
            color: "var(--warn)",
            borderRadius: 10,
            fontSize: 12.5,
            marginBottom: 28,
          }}
        >
          <strong>Borrador técnico.</strong> Este documento es un esquema generado por el
          equipo de producto pendiente de revisión jurídica. Hasta que el asesor
          legal lo valide, considéralo informativo.
        </div>

        {children}

        <footer
          style={{
            marginTop: 56,
            paddingTop: 24,
            borderTop: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            fontSize: 12.5,
            color: "var(--ink-4)",
          }}
        >
          <span>
            © {new Date().getFullYear()} Inseryal by Marina d&apos;Or
          </span>
          <span style={{ display: "flex", gap: 16 }}>
            <Link href="/privacidad" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
              Política de Privacidad
            </Link>
            <Link href="/terminos" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
              Términos del Servicio
            </Link>
            <Link href="/login" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
              Iniciar sesión
            </Link>
          </span>
        </footer>
      </article>
    </main>
  );
}
