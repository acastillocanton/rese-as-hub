"use client";

import { useState, useTransition } from "react";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { inviteReviewsManager } from "./actions";

export function InviteManagerButton({
  label = "+ Invitar gestor",
  primary = false,
}: {
  label?: string;
  primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ link: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
    setSuccess(null);
    setCopied(false);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const input = {
        fullName: String(formData.get("fullName") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
      };
      const result = await inviteReviewsManager(input as never);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess({ link: result.inviteLink, email: result.email });
    });
  }

  async function copyLink() {
    if (!success) return;
    try {
      await navigator.clipboard.writeText(success.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <>
      <GhostBtn primary={primary} onClick={() => setOpen(true)}>
        {label}
      </GhostBtn>

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
                Nuevo gestor de reseñas
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
                {success ? "Invitación lista" : "Invitar al equipo de reseñas"}
              </div>
              {!success && (
                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: 12.5,
                    color: "var(--ink-3)",
                    lineHeight: 1.55,
                  }}
                >
                  Acceso solo lectura: lista de reseñas, ranking de comerciales y
                  descarga del Excel mensual. No ve clientes ni puede modificar
                  nada.
                </p>
              )}
            </div>

            {success ? (
              <div style={{ padding: "18px 22px" }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    color: "var(--ink-2)",
                    lineHeight: 1.55,
                  }}
                >
                  Hemos creado el perfil de <strong>{success.email}</strong>. Copia
                  este enlace y envíaselo — al abrirlo, completará el alta y
                  entrará directo al panel del gestor.
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
                  {success.link}
                </div>
                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                    Enlace de un solo uso. Si caduca, vuelve a invitar.
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <GhostBtn onClick={close}>Cerrar</GhostBtn>
                    <GhostBtn primary onClick={copyLink}>
                      {copied ? "✓ Copiado" : "Copiar enlace"}
                    </GhostBtn>
                  </div>
                </div>
              </div>
            ) : (
              <form action={handleSubmit}>
                <div
                  style={{
                    padding: "18px 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  <Field label="Nombre completo">
                    <input
                      name="fullName"
                      required
                      minLength={2}
                      maxLength={120}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Email" hint="Donde recibirá el acceso">
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="off"
                      style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                    />
                  </Field>
                  <Field label="Teléfono (opcional)">
                    <input name="phone" type="tel" maxLength={40} style={inputStyle} />
                  </Field>
                  {error && (
                    <div
                      role="alert"
                      style={{
                        padding: "8px 10px",
                        background: "var(--warn-bg)",
                        color: "var(--warn)",
                        borderRadius: 8,
                        fontSize: 12.5,
                      }}
                    >
                      {error}
                    </div>
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
                  <GhostBtn type="button" onClick={close} disabled={isPending}>
                    Cancelar
                  </GhostBtn>
                  <GhostBtn primary type="submit" disabled={isPending}>
                    {isPending ? "Creando…" : "Crear invitación"}
                  </GhostBtn>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  background: "var(--surface)",
  border: "1px solid var(--line-strong)",
  borderRadius: 9,
  fontSize: 13,
  color: "var(--ink)",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11.5,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--ink-4)" }}>{hint}</div>
      )}
    </div>
  );
}
