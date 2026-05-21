"use client";

import { useState, useTransition } from "react";
import { GhostBtn } from "@/components/ui/GhostBtn";

type Result =
  | { ok: true; link: string; email: string }
  | { ok: false; error: string };

type Props = {
  id: string;
  name: string;
  /** Server action a invocar. Cada sección (comerciales/gestores) le pasa su
   *  propio action — así mantenemos el chequeo de rol del lado del servidor. */
  action: (id: string) => Promise<Result>;
  variant?: "compact" | "prominent";
};

/**
 * Botón "Reenviar acceso": pide un magic-link nuevo para el usuario destino
 * y abre un dialog con el enlace para que el admin lo copie y comparta.
 */
export function ResendAccessButton({ id, name, action, variant = "compact" }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isProminent = variant === "prominent";

  function onClick() {
    setResult(null);
    setCopied(false);
    setOpen(true);
    startTransition(async () => {
      const r = await action(id);
      setResult(r);
    });
  }

  function close() {
    setOpen(false);
    setResult(null);
    setCopied(false);
  }

  async function copyLink() {
    if (!result || !result.ok) return;
    try {
      await navigator.clipboard.writeText(result.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending && open}
        style={{
          padding: isProminent ? "7px 12px" : "5px 10px",
          background: "transparent",
          border: "1px solid var(--line-strong)",
          borderRadius: isProminent ? 9 : 7,
          fontSize: isProminent ? 13 : 12,
          color: "var(--ink-2)",
          cursor: "pointer",
          fontWeight: isProminent ? 500 : 400,
        }}
      >
        {isProminent ? "Reenviar acceso" : "Reenviar"}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(20,20,22,0.32)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            style={{
              width: 520,
              maxWidth: "100%",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 18,
              boxShadow:
                "0 24px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "20px 22px 14px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 500 }}>
                Reenviar acceso · {name}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: "-0.025em",
                  marginTop: 2,
                }}
              >
                {result?.ok ? "Enlace listo" : isPending ? "Generando enlace…" : "Reenviar acceso"}
              </div>
            </div>

            <div style={{ padding: "18px 22px" }}>
              {!result && isPending && (
                <div style={{ fontSize: 13.5, color: "var(--ink-3)" }}>
                  Generando un nuevo magic-link para esta persona…
                </div>
              )}

              {result && !result.ok && (
                <div
                  role="alert"
                  style={{
                    padding: "10px 12px",
                    background: "var(--warn-bg)",
                    color: "var(--warn)",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  {result.error}
                </div>
              )}

              {result?.ok && (
                <>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      color: "var(--ink-2)",
                      lineHeight: 1.55,
                    }}
                  >
                    Nuevo enlace de acceso para <strong>{result.email}</strong>.
                    Cópialo y compártelo por WhatsApp, email o como prefieras.
                    Es de un solo uso — si caduca, vuelve a pulsar Reenviar.
                  </p>
                  <div
                    style={{
                      marginTop: 14,
                      padding: "10px 12px",
                      background: "var(--surface-2)",
                      border: "1px solid var(--line-strong)",
                      borderRadius: 9,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11.5,
                      color: "var(--ink-2)",
                      wordBreak: "break-all",
                      maxHeight: 120,
                      overflow: "auto",
                    }}
                  >
                    {result.link}
                  </div>
                </>
              )}
            </div>

            <div
              style={{
                padding: "14px 22px",
                borderTop: "1px solid var(--line)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <GhostBtn onClick={close}>Cerrar</GhostBtn>
              {result?.ok && (
                <GhostBtn primary onClick={copyLink}>
                  {copied ? "✓ Copiado" : "Copiar enlace"}
                </GhostBtn>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
