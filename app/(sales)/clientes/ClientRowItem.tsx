"use client";

import { useState, useTransition } from "react";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { deleteClientRecord, type ClientRow } from "./actions";
import { ClientLinkDialog } from "./ClientLinkDialog";

type ClientRowItemProps = {
  client: ClientRow;
  last: boolean;
  appBase: string;
  salesName: string;
  salesSlug: string;
};

export function ClientRowItem({
  client,
  last,
  appBase,
  salesName,
  salesSlug,
}: ClientRowItemProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    const ok = window.confirm(
      `¿Eliminar a ${client.full_name}?\n\nSu enlace dejará de funcionar para nuevas reseñas; las reseñas ya atribuidas se conservan.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await deleteClientRecord(client.id);
      if (!r.ok) alert(r.error);
    });
  }

  return (
    <>
      <div
        style={{
          padding: "14px 22px",
          borderBottom: last ? "none" : "1px solid var(--line)",
          display: "grid",
          gridTemplateColumns: "1.6fr 1.4fr 1fr 1fr 200px",
          gap: 14,
          alignItems: "center",
          fontSize: 13.5,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              letterSpacing: "-0.005em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {client.full_name}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              fontFamily: "var(--font-mono)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            /c/{salesSlug}/{client.slug}
          </div>
        </div>
        <span
          style={{
            fontSize: 12.5,
            color: client.email ? "var(--ink-3)" : "var(--ink-4)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {client.email ?? "—"}
        </span>
        <span
          style={{
            fontSize: 12.5,
            color: client.phone ? "var(--ink-3)" : "var(--ink-4)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {client.phone ?? "—"}
        </span>
        <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
          {new Date(client.created_at).toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <GhostBtn onClick={() => setOpen(true)}>Ver enlace</GhostBtn>
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            style={{
              padding: "5px 10px",
              background: "transparent",
              border: "1px solid var(--line-strong)",
              borderRadius: 7,
              fontSize: 12,
              color: "var(--ink-3)",
              cursor: isPending ? "wait" : "pointer",
            }}
          >
            {isPending ? "…" : "Eliminar"}
          </button>
        </div>
      </div>

      <ClientLinkDialog
        open={open}
        onClose={() => setOpen(false)}
        appBase={appBase}
        salesName={salesName}
        salesSlug={salesSlug}
        clientName={client.full_name}
        clientSlug={client.slug}
        clientEmail={client.email}
        clientPhone={client.phone}
      />
    </>
  );
}
