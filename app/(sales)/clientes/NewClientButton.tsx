"use client";

import { useState, useTransition } from "react";
import { GhostBtn } from "@/components/ui/GhostBtn";
import {
  createClientRecord,
  findOrphanReviewsForClient,
  type ClientRow,
} from "./actions";
import { ClientLinkDialog } from "./ClientLinkDialog";
import { OrphanReviewsModal } from "@/components/clients/OrphanReviewsModal";
import type { OrphanReviewCandidate } from "@/lib/clients/orphan-reviews";
import type { Brand } from "@/lib/supabase/types";

type NewClientButtonProps = {
  appBase: string;
  salesName: string;
  salesSlug: string;
  brand: Brand;
  fab?: boolean;
};

export function NewClientButton({ appBase, salesName, salesSlug, brand, fab }: NewClientButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ClientRow | null>(null);
  const [orphanCandidates, setOrphanCandidates] = useState<OrphanReviewCandidate[]>([]);
  const [showOrphans, setShowOrphans] = useState(false);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
    setCreated(null);
    setOrphanCandidates([]);
    setShowOrphans(false);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const input = {
        fullName: String(formData.get("fullName") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
      };
      const result = await createClientRecord(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(result.client);

      // Buscar reseñas huérfanas del comercial que se parezcan al
      // cliente recién creado. Si hay candidatas, abrimos el modal de
      // sugerencias ANTES del ClientLinkDialog — vincular primero,
      // compartir enlace después. Si no hay, ClientLinkDialog se abre
      // directamente (created != null + showOrphans=false).
      const orphans = await findOrphanReviewsForClient(result.client.id);
      if (orphans.ok && orphans.candidates.length > 0) {
        setOrphanCandidates(orphans.candidates);
        setShowOrphans(true);
      }
    });
  }

  return (
    <>
      {fab ? (
        <button
          className="m-fab-primary"
          onClick={() => setOpen(true)}
          style={{
            padding: "14px 28px",
            background: "var(--ink)",
            color: "#fff",
            border: "none",
            borderRadius: 999,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.22), 0 1px 4px rgba(0,0,0,0.12)",
          }}
        >
          + Nuevo cliente
        </button>
      ) : (
        <GhostBtn primary onClick={() => setOpen(true)}>
          + Nuevo cliente
        </GhostBtn>
      )}

      {open && !created && (
        <div
          style={modalBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div style={modalCard}>
            <div style={modalHeader}>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 500 }}>
                Nuevo cliente
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
                Genera un enlace personalizado
              </div>
            </div>

            <form action={handleSubmit}>
              <div
                style={{
                  padding: "18px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <Field label="Nombre completo" hint="Aparecerá en el enlace, p.ej. /maria-gonzalez">
                  <input
                    name="fullName"
                    required
                    minLength={2}
                    maxLength={120}
                    autoFocus
                    style={inputStyle}
                  />
                </Field>
                <Field label="Teléfono (opcional)" hint="Para WhatsApp y SMS pre-rellenados">
                  <input name="phone" type="tel" maxLength={40} style={inputStyle} />
                </Field>
                <Field label="Email (opcional)">
                  <input
                    name="email"
                    type="email"
                    maxLength={120}
                    autoComplete="off"
                    style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                  />
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
                  {isPending ? "Creando…" : "Crear y ver enlace"}
                </GhostBtn>
              </div>
            </form>
          </div>
        </div>
      )}

      {created && showOrphans && (
        <OrphanReviewsModal
          open={true}
          onClose={() => setShowOrphans(false)}
          clientId={created.id}
          clientName={created.full_name}
          candidates={orphanCandidates}
        />
      )}

      {created && !showOrphans && (
        <ClientLinkDialog
          open={true}
          onClose={close}
          appBase={appBase}
          salesName={salesName}
          salesSlug={salesSlug}
          clientName={created.full_name}
          clientSlug={created.slug}
          clientEmail={created.email}
          clientPhone={created.phone}
          brand={brand}
        />
      )}
    </>
  );
}

const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  background: "rgba(20,20,22,0.32)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const modalCard: React.CSSProperties = {
  width: 520,
  maxWidth: "100%",
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 18,
  boxShadow: "0 24px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)",
  overflow: "hidden",
};

const modalHeader: React.CSSProperties = {
  padding: "20px 22px 14px",
  borderBottom: "1px solid var(--line)",
};

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
