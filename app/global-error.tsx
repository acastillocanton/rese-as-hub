"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          padding: "48px 24px",
          background: "#f5f3ee",
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif",
          color: "#1a1a1a",
        }}
      >
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e9e4d8",
              borderRadius: 12,
              padding: "32px 28px",
            }}
          >
            <h1 style={{ margin: "0 0 12px 0", fontSize: 22, fontWeight: 700 }}>
              Algo ha fallado
            </h1>
            <p style={{ margin: "0 0 20px 0", color: "#555555" }}>
              La aplicación ha encontrado un error inesperado.
            </p>
            {error.digest ? (
              <p style={{ margin: "0 0 20px 0", color: "#8a8478", fontSize: 12 }}>
                Referencia: <code>{error.digest}</code>
              </p>
            ) : null}
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "11px 22px",
                background: "#111111",
                color: "#ffffff",
                border: 0,
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
