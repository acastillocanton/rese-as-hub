"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Imagen de ayuda con dos comportamientos:
 *  - Fallback de "captura pendiente" cuando el fichero no existe en
 *    public/help/{src}. El placeholder muestra el nombre esperado para
 *    que el responsable sepa qué capturar.
 *  - Lightbox: al hacer click en la imagen real, se abre en overlay
 *    fullscreen para que el lector la vea ampliada. Se cierra con
 *    Escape o clic fuera.
 */
export function HelpFigure({
  src,
  caption,
  maxWidth,
}: {
  src: string;
  caption: string;
  /** Tope de ancho de visualización en px. Útil para capturas verticales
   *  (móvil, sidebar) que de otro modo se verían enormes en el contenedor
   *  ancho. Si se omite, la imagen llena el ancho disponible (hasta su
   *  tamaño natural). El lightbox siempre muestra la imagen a tamaño grande. */
  maxWidth?: number;
}) {
  const [hasError, setHasError] = useState(false);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    // Bloquear scroll del body mientras está abierto.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  return (
    <>
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
            onClick={() => setOpen(true)}
            style={{
              // maxWidth (no width:100%) evita AMPLIAR capturas estrechas:
              // las de escritorio (~1400px) llenan el ancho del contenedor,
              // pero las verticales (móvil, sidebar) se topan con `maxWidth`
              // y se muestran tamaño natural CENTRADAS, sin estirarse.
              display: "block",
              width: maxWidth ? "100%" : undefined,
              maxWidth: maxWidth ? `${maxWidth}px` : "100%",
              height: "auto",
              margin: "0 auto",
              background: "var(--surface)",
              cursor: "zoom-in",
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
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          <span>{caption}</span>
          {!hasError && (
            <span style={{ fontSize: 11.5, color: "var(--ink-4)", whiteSpace: "nowrap" }}>
              clic para ampliar
            </span>
          )}
        </figcaption>
      </figure>

      {/* Lightbox overlay */}
      {open && !hasError && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={caption}
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.85)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 40,
            cursor: "zoom-out",
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            aria-label="Cerrar"
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              width: 40,
              height: 40,
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={caption}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "95vw",
              maxHeight: "85vh",
              objectFit: "contain",
              borderRadius: 8,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              cursor: "default",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 20,
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: 13,
              color: "rgba(255,255,255,0.85)",
              padding: "0 40px",
              maxWidth: 800,
              margin: "0 auto",
            }}
          >
            {caption}
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.5)",
                marginTop: 4,
              }}
            >
              Pulsa <kbd style={kbdStyle}>Esc</kbd> o haz clic fuera para cerrar
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const kbdStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  fontSize: 10,
  fontFamily: "var(--font-mono, monospace)",
  background: "rgba(255,255,255,0.15)",
  border: "1px solid rgba(255,255,255,0.3)",
  borderRadius: 4,
  margin: "0 2px",
};
