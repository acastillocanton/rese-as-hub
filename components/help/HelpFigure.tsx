"use client";

import { useState } from "react";

/**
 * Imagen de ayuda con fallback de "captura pendiente". Cuando se sube el
 * fichero a public/help/{src}, la imagen aparece. Mientras no exista, se
 * muestra un placeholder gris con el nombre del archivo y el caption para
 * que el responsable sepa qué capturar.
 */
export function HelpFigure({
  src,
  caption,
}: {
  /** Ruta relativa dentro de /public, ej. "/help/01-login.png" */
  src: string;
  /** Pie de foto descriptivo de qué muestra. */
  caption: string;
}) {
  const [hasError, setHasError] = useState(false);

  return (
    <figure
      style={{
        margin: "20px 0 28px",
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {hasError ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 20px",
            gap: 8,
            background:
              "repeating-linear-gradient(45deg, var(--surface-2), var(--surface-2) 8px, var(--surface) 8px, var(--surface) 16px)",
            minHeight: 220,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--ink-4)",
              fontWeight: 600,
            }}
          >
            Captura pendiente
          </div>
          <code
            style={{
              fontSize: 12,
              color: "var(--ink-2)",
              background: "var(--surface)",
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--line)",
            }}
          >
            public{src}
          </code>
          <div
            style={{
              fontSize: 13,
              color: "var(--ink-3)",
              marginTop: 4,
              maxWidth: 460,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            {caption}
          </div>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={caption}
          onError={() => setHasError(true)}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            background: "var(--surface)",
          }}
        />
      )}
      <figcaption
        style={{
          padding: "10px 16px",
          fontSize: 12.5,
          color: "var(--ink-4)",
          background: "var(--bg)",
          borderTop: "1px solid var(--line)",
        }}
      >
        {caption}
      </figcaption>
    </figure>
  );
}
