"use client";

import { useEffect } from "react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
};

export function ErrorState({ error, reset, title = "Algo ha fallado" }: Props) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div
      style={{
        padding: "48px 24px",
        maxWidth: 560,
        margin: "0 auto",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e9e4d8",
          borderRadius: 12,
          padding: "32px 28px",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#a8a294",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Error
        </div>
        <h1
          style={{
            margin: "0 0 12px 0",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.015em",
            color: "#111111",
          }}
        >
          {title}
        </h1>
        <p style={{ margin: "0 0 20px 0", color: "#555555", fontSize: 14.5, lineHeight: 1.55 }}>
          Hemos registrado el incidente. Puedes reintentar la operación; si vuelve a fallar, avisa al equipo.
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
            display: "inline-block",
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
  );
}
