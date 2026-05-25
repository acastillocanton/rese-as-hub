"use client";

import { GhostBtn } from "@/components/ui/GhostBtn";
import { ShareBlock } from "./ShareBlock";
import type { Brand } from "@/lib/supabase/types";

export type ClientLinkDialogProps = {
  open: boolean;
  onClose: () => void;
  appBase: string;
  salesName: string;
  salesSlug: string;
  clientName: string;
  clientSlug: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  brand: Brand;
};

export function ClientLinkDialog(props: ClientLinkDialogProps) {
  const {
    open,
    onClose,
    appBase,
    salesName,
    salesSlug,
    clientName,
    clientSlug,
    clientEmail,
    clientPhone,
    brand,
  } = props;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(20,20,22,0.32)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 680,
          maxWidth: "100%",
          maxHeight: "calc(100vh - 48px)",
          overflow: "auto",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 18,
          boxShadow:
            "0 24px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            padding: "20px 22px 14px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 500 }}>
            Enlace para {clientName}
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
            Compártelo y aterriza directo en Google
          </div>
        </div>

        <div style={{ padding: "18px 22px" }}>
          <ShareBlock
            appBase={appBase}
            salesName={salesName}
            salesSlug={salesSlug}
            clientName={clientName}
            clientSlug={clientSlug}
            clientEmail={clientEmail}
            clientPhone={clientPhone}
            brand={brand}
          />
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
          <GhostBtn type="button" onClick={onClose}>
            Cerrar
          </GhostBtn>
        </div>
      </div>
    </div>
  );
}
