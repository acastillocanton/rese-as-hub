"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { Stars } from "@/components/ui/Stars";
import { linkOrphanReviewToClient } from "@/app/(sales)/clientes/actions";
import type { OrphanReviewCandidate } from "@/lib/clients/orphan-reviews";

/**
 * Modal que aparece tras crear (o reclamar con) un cliente nuevo cuando
 * el sistema detecta reseñas counted del comercial sin client_id cuyo
 * autor se parece al nombre del cliente. Permite vincular cada candidata
 * con un click.
 *
 * Lógica de visibilidad: el caller decide si abrir (sólo si
 * `candidates.length > 0` en el momento de la creación). Una vez abierto,
 * las vinculaciones quitan filas del listado; cuando el usuario cierra,
 * refrescamos la página para que el resto del UI vea los cambios.
 */
export function OrphanReviewsModal({
  open,
  onClose,
  clientId,
  clientName,
  candidates,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  candidates: OrphanReviewCandidate[];
}) {
  const router = useRouter();
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const visibleCandidates = candidates.filter((c) => !linkedIds.has(c.id));
  const allLinked = visibleCandidates.length === 0 && linkedIds.size > 0;

  function handleClose() {
    setError(null);
    setLinkedIds(new Set());
    setPendingId(null);
    onClose();
    if (linkedIds.size > 0) router.refresh();
  }

  function onLink(reviewId: string) {
    setError(null);
    setPendingId(reviewId);
    startTransition(async () => {
      const r = await linkOrphanReviewToClient({ reviewId, clientId });
      setPendingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLinkedIds((prev) => new Set(prev).add(reviewId));
    });
  }

  return (
    <div
      style={modalBackdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div style={modalCard}>
        <div style={modalHeader}>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 500 }}>
            Posibles reseñas de este cliente
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
            ¿Alguna es de {clientName}?
          </div>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 12.5,
              color: "var(--ink-3)",
              lineHeight: 1.55,
            }}
          >
            Hemos encontrado reseñas atribuidas a este comercial sin cliente
            asignado cuyo autor se parece al nombre del cliente. Pulsa
            &ldquo;Vincular&rdquo; en las que sean suyas.
          </p>
        </div>

        <div
          style={{
            padding: "14px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          {allLinked && (
            <div
              style={{
                padding: "12px 14px",
                background: "var(--ok-bg, rgba(0, 128, 0, 0.08))",
                color: "var(--ok, #1f6f1f)",
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              Todas las reseñas vinculadas. Pulsa &ldquo;Cerrar&rdquo; para
              continuar.
            </div>
          )}

          {!allLinked && visibleCandidates.length === 0 && (
            <div
              style={{
                padding: "12px 14px",
                background: "var(--surface-2)",
                color: "var(--ink-3)",
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              No hay candidatas que mostrar.
            </div>
          )}

          {visibleCandidates.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "12px 14px",
                border: "1px solid var(--line)",
                borderRadius: 10,
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {c.author_name}
                  </span>
                  <Stars value={c.rating} size={12} />
                  <span style={similarityBadge}>{c.similarity}% match</span>
                </div>
                <div
                  style={{ marginTop: 4, fontSize: 11.5, color: "var(--ink-4)" }}
                >
                  {formatDate(c.google_created_at)}
                </div>
              </div>
              <GhostBtn
                primary
                onClick={() => onLink(c.id)}
                disabled={isPending && pendingId === c.id}
              >
                {pendingId === c.id ? "Vinculando…" : "Vincular"}
              </GhostBtn>
            </div>
          ))}

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
          <GhostBtn onClick={handleClose} disabled={isPending}>
            {linkedIds.size > 0 ? "Cerrar" : "Saltar"}
          </GhostBtn>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  background: "rgba(20,20,22,0.32)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const modalCard: React.CSSProperties = {
  width: 560,
  maxWidth: "100%",
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 18,
  boxShadow: "0 24px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const modalHeader: React.CSSProperties = {
  padding: "20px 22px 14px",
  borderBottom: "1px solid var(--line)",
};

const similarityBadge: React.CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  color: "var(--ink-3)",
  fontWeight: 500,
};
