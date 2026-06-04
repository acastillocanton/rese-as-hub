"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GhostBtn } from "@/components/ui/GhostBtn";
import {
  deleteClientRecord,
  findOrphanReviewsForClient,
  type ClientRow,
} from "./actions";
import { ClientLinkDialog } from "./ClientLinkDialog";
import { OrphanReviewsModal } from "@/components/clients/OrphanReviewsModal";
import type { OrphanReviewCandidate } from "@/lib/clients/orphan-reviews";
import type { SavedTemplates } from "@/lib/messaging";
import type { Brand } from "@/lib/supabase/types";

type ClientRowItemProps = {
  client: ClientRow;
  last: boolean;
  appBase: string;
  salesName: string;
  salesSlug: string;
  brand: Brand;
  templates?: SavedTemplates;
};

export function ClientRowItem({
  client,
  last,
  appBase,
  salesName,
  salesSlug,
  brand,
  templates,
}: ClientRowItemProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Estado del botón "Buscar reseñas" — abre el modal OrphanReviewsModal
  // con las candidatas detectadas. Útil para vincular reseñas antiguas
  // counted sin client_id que no se hayan detectado al crear el cliente.
  const [orphanCandidates, setOrphanCandidates] = useState<OrphanReviewCandidate[]>([]);
  const [autoLinkedCount, setAutoLinkedCount] = useState(0);
  const [orphanOpen, setOrphanOpen] = useState(false);
  const [isSearchingOrphans, startOrphanSearch] = useTransition();

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

  function onSearchOrphans() {
    startOrphanSearch(async () => {
      const r = await findOrphanReviewsForClient(client.id);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      if (r.candidates.length === 0) {
        if (r.autoLinked > 0) {
          // Las casi-exactas se vincularon solas; no quedan dudosas.
          alert(
            `Vinculé ${r.autoLinked} reseña${r.autoLinked > 1 ? "s" : ""} automáticamente a ${client.full_name}.`,
          );
          router.refresh();
        } else {
          // Vacío: el botón solo reasigna reseñas YA contadas para el comercial
          // que quedaron sin cliente. Las reseñas sin dueño se reclaman en
          // Verificación → ofrecemos ir allí (un alert no admite enlace).
          const goVerify = window.confirm(
            `No encontré reseñas verificadas sin cliente que se parezcan a ${client.full_name}.\n\n` +
              `Este botón solo reasigna reseñas que ya cuentan para ti pero se quedaron sin cliente. ` +
              `Las reseñas que aún no tienen dueño se reclaman en "Verificación".\n\n` +
              `¿Quieres ir a Verificación para revisar las reseñas sin atribuir de tu ficha?`,
          );
          if (goVerify) router.push("/resenas/verificacion?state=unmatched");
        }
        return;
      }
      setOrphanCandidates(r.candidates);
      setAutoLinkedCount(r.autoLinked);
      setOrphanOpen(true);
    });
  }

  const altaLabel = new Date(client.created_at).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <>
      {/* Desktop: fila tabular de 5 columnas */}
      <div
        className="m-hide-mobile"
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
        <Link
          href={`/clientes/${client.slug}`}
          style={{
            minWidth: 0,
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              letterSpacing: "-0.005em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "var(--ink)",
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
        </Link>
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
        <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>{altaLabel}</span>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <GhostBtn onClick={() => setOpen(true)}>Ver enlace</GhostBtn>
          <button
            type="button"
            onClick={onSearchOrphans}
            disabled={isSearchingOrphans}
            title="Buscar reseñas counted sin cliente que se parezcan a este nombre"
            style={smallBtn(isSearchingOrphans)}
          >
            {isSearchingOrphans ? "…" : "Buscar reseñas"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            style={smallBtn(isPending)}
          >
            {isPending ? "…" : "Eliminar"}
          </button>
        </div>
      </div>

      {/* Mobile: card vertical */}
      <div
        className="m-mobile-only"
        style={{
          padding: "14px 16px",
          borderBottom: last ? "none" : "1px solid var(--line)",
        }}
      >
        <Link
          href={`/clientes/${client.slug}`}
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            {client.full_name}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              fontFamily: "var(--font-mono)",
              marginTop: 2,
              wordBreak: "break-all",
            }}
          >
            /c/{salesSlug}/{client.slug}
          </div>
        </Link>
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gap: 4,
            fontSize: 12.5,
            color: "var(--ink-3)",
          }}
        >
          <div>
            <span style={{ color: "var(--ink-4)", marginRight: 6 }}>Email</span>
            {client.email ?? "—"}
          </div>
          <div>
            <span style={{ color: "var(--ink-4)", marginRight: 6 }}>Teléfono</span>
            {client.phone ?? "—"}
          </div>
          <div>
            <span style={{ color: "var(--ink-4)", marginRight: 6 }}>Alta</span>
            {altaLabel}
          </div>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <GhostBtn onClick={() => setOpen(true)}>Ver enlace</GhostBtn>
          <button
            type="button"
            onClick={onSearchOrphans}
            disabled={isSearchingOrphans}
            style={mobileBtn(isSearchingOrphans)}
          >
            {isSearchingOrphans ? "…" : "Buscar reseñas"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            style={mobileBtn(isPending)}
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
        brand={brand}
        templates={templates}
      />

      {orphanOpen && (
        <OrphanReviewsModal
          open={true}
          onClose={() => {
            setOrphanOpen(false);
            setOrphanCandidates([]);
            setAutoLinkedCount(0);
          }}
          clientId={client.id}
          clientName={client.full_name}
          candidates={orphanCandidates}
          autoLinkedCount={autoLinkedCount}
        />
      )}
    </>
  );
}

function smallBtn(loading: boolean): React.CSSProperties {
  return {
    padding: "5px 10px",
    background: "transparent",
    border: "1px solid var(--line-strong)",
    borderRadius: 7,
    fontSize: 12,
    color: "var(--ink-3)",
    cursor: loading ? "wait" : "pointer",
  };
}

function mobileBtn(loading: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    background: "transparent",
    border: "1px solid var(--line-strong)",
    borderRadius: 7,
    fontSize: 12.5,
    color: "var(--ink-3)",
    cursor: loading ? "wait" : "pointer",
  };
}
