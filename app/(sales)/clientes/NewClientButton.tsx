"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { FormField as Field, formInputStyle as inputStyle } from "@/components/ui/FormField";
import {
  createClientRecord,
  findOrphanReviewsForClient,
  type ClientRow,
} from "./actions";
import { ClientLinkDialog } from "./ClientLinkDialog";
import { OrphanReviewsModal } from "@/components/clients/OrphanReviewsModal";
import type { OrphanReviewCandidate } from "@/lib/clients/orphan-reviews";
import type { SavedTemplates } from "@/lib/messaging";
import type { Brand } from "@/lib/supabase/types";

type NewClientButtonProps = {
  appBase: string;
  salesName: string;
  salesSlug: string;
  brand: Brand;
  templates?: SavedTemplates;
};

export function NewClientButton({ appBase, salesName, salesSlug, brand, templates }: NewClientButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ClientRow | null>(null);
  const [orphanCandidates, setOrphanCandidates] = useState<OrphanReviewCandidate[]>([]);
  const [autoLinkedCount, setAutoLinkedCount] = useState(0);
  const [showOrphans, setShowOrphans] = useState(false);
  const [isPending, startTransition] = useTransition();

  function close() {
    // Si se llegó a crear un cliente, refrescamos la lista AHORA (al cerrar),
    // no durante la creación: createClientRecord ya no revalida para no
    // desmontar este botón + el diálogo mientras está abierto (ver actions.ts).
    const createdClient = created !== null;
    setOpen(false);
    setError(null);
    setCreated(null);
    setOrphanCandidates([]);
    setAutoLinkedCount(0);
    setShowOrphans(false);
    if (createdClient) router.refresh();
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

      // Buscar reseñas huérfanas del comercial que se parezcan al cliente
      // recién creado. Las casi-exactas (≥90) se vinculan solas dentro de
      // findOrphanReviewsForClient; solo abrimos el modal si quedan dudosas
      // (50-89) que el humano deba revisar. Si todo fue auto-vínculo (o no
      // hubo nada), pasamos directo al ClientLinkDialog (compartir enlace) —
      // sin fricción. Las auto-vinculadas se ven al refrescar al cerrar.
      const orphans = await findOrphanReviewsForClient(result.client.id);
      if (orphans.ok && orphans.candidates.length > 0) {
        setOrphanCandidates(orphans.candidates);
        setAutoLinkedCount(orphans.autoLinked);
        setShowOrphans(true);
      }
    });
  }

  return (
    <>
      <GhostBtn primary onClick={() => setOpen(true)}>
        + Nuevo cliente
      </GhostBtn>

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
          autoLinkedCount={autoLinkedCount}
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
          templates={templates}
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

// inputStyle (formInputStyle) y Field (FormField) viven en components/ui/FormField.tsx
