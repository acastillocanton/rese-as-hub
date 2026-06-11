"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Stars } from "@/components/ui/Stars";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { Pill } from "@/components/ui/Pill";
import { DuplicateBadge } from "@/components/ui/DuplicateBadge";
import {
  confirmReview,
  rejectReview,
  reassignReview,
  claimReview,
} from "./actions";
import { RemovalControls } from "@/components/ui/RemovalControls";
import { GoogleReviewLink } from "@/components/ui/GoogleReviewLink";
import { OrphanReviewsModal } from "@/components/clients/OrphanReviewsModal";
import { findOrphanReviewsForClient } from "@/app/(sales)/clientes/actions";
import type { OrphanReviewCandidate } from "@/lib/clients/orphan-reviews";
import type { Role } from "@/lib/supabase/types";

type Review = {
  id: string;
  author_name: string;
  rating: number;
  text: string | null;
  google_created_at: string;
  match_state: string;
  match_confidence: number;
  match_evidence: Record<string, unknown> | null;
  removed_at: string | null;
  is_duplicate: boolean;
  google_maps_url: string | null;
  sales: { id: string; full_name: string; slug: string } | null;
  client: { id: string; full_name: string } | null;
  location: { id: string; name: string; google_place_id: string | null } | null;
};

type SalesOption = {
  id: string;
  full_name: string;
  slug: string;
  role: "sales" | "office_director";
  clients: { id: string; full_name: string }[];
};

export function ReviewVerificationRow({
  review,
  salesOptions,
  viewerRole,
  viewerId,
}: {
  review: Review;
  salesOptions: SalesOption[];
  viewerRole: Role;
  viewerId: string;
}) {
  const router = useRouter();
  const isSales = viewerRole === "sales";

  // El sales solo ve y actúa sobre filas unmatched (sin atribuir).
  // Para él el panel de reclamación sustituye al resto de UI de acciones.
  const canClaim = isSales && review.match_state === "unmatched" && !review.removed_at;

  return isSales ? (
    <SalesRow
      review={review}
      salesOptions={salesOptions}
      viewerId={viewerId}
      canClaim={canClaim}
      router={router}
    />
  ) : (
    <FullRow review={review} salesOptions={salesOptions} router={router} />
  );
}

/**
 * Variante completa para admin, reviews_manager y office_director: confirmar
 * / rechazar / reasignar / marcar eliminada / restaurar.
 */
function FullRow({
  review,
  salesOptions,
  router,
}: {
  review: Review;
  salesOptions: SalesOption[];
  router: ReturnType<typeof useRouter>;
}) {
  const [reassigning, setReassigning] = useState(false);
  const [selectedSalesId, setSelectedSalesId] = useState<string>(
    review.sales?.id ?? "",
  );
  const [selectedClientId, setSelectedClientId] = useState<string>(
    review.client?.id ?? "",
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const clientsForSelectedSales = useMemo(() => {
    return salesOptions.find((s) => s.id === selectedSalesId)?.clients ?? [];
  }, [salesOptions, selectedSalesId]);

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const r = await confirmReview(review.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function onReject() {
    const ok = window.confirm(
      "¿Marcar esta reseña como no atribuida?\n\nNo se contabilizará para ningún comercial. La reseña sigue existiendo en la base.",
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const r = await rejectReview(review.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function onReassign() {
    if (!selectedSalesId) {
      setError("Selecciona un comercial.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await reassignReview({
        reviewId: review.id,
        salesId: selectedSalesId,
        clientId: selectedClientId || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <ReviewHeader review={review} />
      {review.text && <ReviewText text={review.text} />}
      <MatcherProposal review={review} />

      {reassigning && (
        <div
          style={{
            marginTop: 16,
            padding: "14px 16px",
            border: "1px solid var(--line-strong)",
            borderRadius: 10,
            background: "var(--surface)",
          }}
        >
          <div style={sectionLabel}>Reasignar manualmente</div>
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={fieldLabel}>Comercial</span>
              <select
                value={selectedSalesId}
                onChange={(e) => {
                  setSelectedSalesId(e.target.value);
                  setSelectedClientId("");
                }}
                style={inputStyle}
              >
                <option value="">— Selecciona —</option>
                {salesOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.role === "office_director" ? `★ ${s.full_name}` : s.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={fieldLabel}>Cliente (opcional)</span>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                style={inputStyle}
                disabled={!selectedSalesId}
              >
                <option value="">— Sin cliente específico —</option>
                {clientsForSelectedSales.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <GhostBtn
              onClick={() => {
                setReassigning(false);
                setSelectedSalesId(review.sales?.id ?? "");
                setSelectedClientId(review.client?.id ?? "");
                setError(null);
              }}
              disabled={isPending}
            >
              Cancelar
            </GhostBtn>
            <GhostBtn primary onClick={onReassign} disabled={isPending || !selectedSalesId}>
              {isPending ? "Guardando…" : "Atribuir al comercial elegido"}
            </GhostBtn>
          </div>
        </div>
      )}

      {error && <ErrorBox message={error} />}

      {!reassigning && (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <RemovalControls reviewId={review.id} removedAt={review.removed_at} size="sm" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <GhostBtn onClick={onReject} disabled={isPending}>
              {isPending ? "…" : "Rechazar"}
            </GhostBtn>
            <GhostBtn onClick={() => setReassigning(true)} disabled={isPending}>
              Reasignar
            </GhostBtn>
            {review.sales && (
              <GhostBtn primary onClick={onConfirm} disabled={isPending}>
                {isPending ? "Guardando…" : `Confirmar a ${review.sales.full_name.split(" ")[0]}`}
              </GhostBtn>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Variante para el rol sales: solo puede "Reclamar" reseñas unmatched de
 * SU ficha. Sin botones de reject/reassign/markRemoved/confirm.
 */
function SalesRow({
  review,
  salesOptions,
  viewerId,
  canClaim,
  router,
}: {
  review: Review;
  salesOptions: SalesOption[];
  viewerId: string;
  canClaim: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const [claimOpen, setClaimOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new" | "none">("existing");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [newClientName, setNewClientName] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Estado del modal de sugerencias de reseñas huérfanas. Solo aparece
  // cuando el sales reclama esta reseña con un cliente nuevo y el sistema
  // detecta OTRAS reseñas suyas counted sin client_id que podrían ser
  // del mismo cliente (autor con nombre similar).
  const [orphanCandidates, setOrphanCandidates] = useState<OrphanReviewCandidate[]>([]);
  const [orphanAutoLinked, setOrphanAutoLinked] = useState(0);
  const [orphanClient, setOrphanClient] = useState<{ id: string; name: string } | null>(null);

  // Como la página ya filtra salesOptions al propio profile cuando el viewer
  // es sales, los clientes del único profile devuelto son sus clientes.
  const myClients = useMemo(() => {
    const self = salesOptions.find((s) => s.id === viewerId);
    return self?.clients ?? [];
  }, [salesOptions, viewerId]);

  function onClaim() {
    setError(null);
    if (mode === "existing" && !selectedClientId) {
      setError("Selecciona un cliente o crea uno nuevo.");
      return;
    }
    if (mode === "new" && newClientName.trim().length < 2) {
      setError("Escribe el nombre del cliente (mínimo 2 caracteres).");
      return;
    }
    startTransition(async () => {
      const newName = mode === "new" ? newClientName.trim() : null;
      const r = await claimReview({
        reviewId: review.id,
        clientId: mode === "existing" ? selectedClientId : null,
        newClientName: newName,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Si el sales creó un cliente nuevo durante la reclamación, buscar
      // otras reseñas counted suyas con client_id=null cuyo autor se
      // parezca al nombre del nuevo cliente, y ofrecerlas para vincular.
      // Si encuentra ≥ 1, abrir el modal antes de hacer router.refresh()
      // (la página se refrescará al cerrar el modal).
      if (r.wasNewClient && r.clientId && newName) {
        const orphans = await findOrphanReviewsForClient(r.clientId);
        if (orphans.ok && orphans.candidates.length > 0) {
          setOrphanCandidates(orphans.candidates);
          setOrphanAutoLinked(orphans.autoLinked);
          setOrphanClient({ id: r.clientId, name: newName });
          return; // no refresh aún, el modal lo hará al cerrarse.
        }
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <ReviewHeader review={review} />
      {review.text && <ReviewText text={review.text} />}

      {/* No mostramos la propuesta del matcher al sales — su trabajo es
          identificar al cliente, no validar al comercial propuesto. */}

      {!canClaim && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            fontSize: 12.5,
            color: "var(--ink-3)",
          }}
        >
          Esta reseña ya está atribuida o ha sido eliminada. No requiere acción
          tuya.
        </div>
      )}

      {canClaim && !claimOpen && (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <GhostBtn primary onClick={() => setClaimOpen(true)} disabled={isPending}>
            Es mía
          </GhostBtn>
        </div>
      )}

      {canClaim && claimOpen && (
        <div
          style={{
            marginTop: 16,
            padding: "14px 16px",
            border: "1px solid var(--line-strong)",
            borderRadius: 10,
            background: "var(--surface)",
          }}
        >
          <div style={sectionLabel}>Reclamar esta reseña</div>
          <p
            style={{
              margin: "8px 0 12px",
              fontSize: 12.5,
              color: "var(--ink-3)",
              lineHeight: 1.5,
            }}
          >
            La reseña se atribuirá a tu cuenta. Selecciona un cliente
            existente, crea uno nuevo o déjalo sin asociar si no lo conoces.
          </p>

          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <ModeChip
              active={mode === "existing"}
              onClick={() => {
                setMode("existing");
                setError(null);
              }}
              label="Cliente existente"
            />
            <ModeChip
              active={mode === "new"}
              onClick={() => {
                setMode("new");
                setError(null);
              }}
              label="+ Nuevo cliente"
            />
            <ModeChip
              active={mode === "none"}
              onClick={() => {
                setMode("none");
                setError(null);
              }}
              label="Sin cliente concreto"
            />
          </div>

          {mode === "existing" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={fieldLabel}>Selecciona cliente</span>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                style={inputStyle}
              >
                <option value="">— Selecciona —</option>
                {myClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
              {myClients.length === 0 && (
                <span style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 4 }}>
                  Aún no tienes clientes. Usa &ldquo;+ Nuevo cliente&rdquo; o déjalo sin asociar.
                </span>
              )}
            </label>
          )}

          {mode === "new" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={fieldLabel}>Nombre del cliente nuevo</span>
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Nombre y apellidos"
                maxLength={120}
                style={inputStyle}
                autoFocus
              />
            </label>
          )}

          {mode === "none" && (
            <p
              style={{
                fontSize: 12.5,
                color: "var(--ink-3)",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              La reseña quedará atribuida a ti pero sin un cliente asociado.
              Puedes editarla más tarde desde &ldquo;Mis reseñas&rdquo;.
            </p>
          )}

          {error && <ErrorBox message={error} />}

          <div
            style={{
              marginTop: 14,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <GhostBtn
              onClick={() => {
                setClaimOpen(false);
                setError(null);
                setMode("existing");
                setSelectedClientId("");
                setNewClientName("");
              }}
              disabled={isPending}
            >
              Cancelar
            </GhostBtn>
            <GhostBtn primary onClick={onClaim} disabled={isPending}>
              {isPending ? "Reclamando…" : "Confirmar reclamación"}
            </GhostBtn>
          </div>
        </div>
      )}

      {orphanClient && (
        <OrphanReviewsModal
          open={true}
          onClose={() => {
            setOrphanClient(null);
            setOrphanCandidates([]);
            setOrphanAutoLinked(0);
            router.refresh();
          }}
          clientId={orphanClient.id}
          clientName={orphanClient.name}
          candidates={orphanCandidates}
          autoLinkedCount={orphanAutoLinked}
        />
      )}
    </Card>
  );
}

function ReviewHeader({ review }: { review: Review }) {
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Stars value={review.rating} size={14} />
          <span
            style={{
              fontWeight: 600,
              fontSize: 14.5,
              letterSpacing: "-0.005em",
            }}
          >
            {review.author_name}
          </span>
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--ink-4)",
            marginTop: 4,
            display: "flex",
            gap: 10,
          }}
        >
          <span>{fmtDateTime(review.google_created_at)}</span>
          {review.location?.name && (
            <>
              <span>·</span>
              <span>{review.location.name}</span>
            </>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 6,
        }}
      >
        <Pill
          tone={
            review.match_state === "pending"
              ? "warn"
              : review.match_state === "counted"
                ? "ok"
                : "neutral"
          }
          withDot
        >
          {review.match_state === "pending"
            ? "Pendiente verificar"
            : review.match_state === "counted"
              ? "Atribuida"
              : "Sin atribuir"}
        </Pill>
        {review.is_duplicate && <DuplicateBadge />}
        <span
          style={{
            fontSize: 11.5,
            color: "var(--ink-4)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          Confianza {review.match_confidence}%
        </span>
        <GoogleReviewLink
          placeId={review.location?.google_place_id}
          mapsUrl={review.google_maps_url}
          variant="compact"
        />
      </div>
    </div>
  );
}

function ReviewText({ text }: { text: string }) {
  return (
    <p
      style={{
        margin: "14px 0 0",
        fontSize: 13.5,
        lineHeight: 1.6,
        color: "var(--ink-2)",
      }}
    >
      {text}
    </p>
  );
}

function MatcherProposal({ review }: { review: Review }) {
  const evidence = review.match_evidence ?? {};
  const evidenceLines = Object.entries(evidence).map(([k, v]) => {
    const valueStr =
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : JSON.stringify(v);
    return { k, v: valueStr };
  });
  return (
    <div
      style={{
        marginTop: 18,
        padding: "12px 14px",
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 10,
      }}
    >
      <div style={sectionLabel}>Propuesta del matcher</div>
      {review.sales ? (
        <div style={{ marginTop: 8, fontSize: 13.5 }}>
          <strong style={{ fontWeight: 600 }}>{review.sales.full_name}</strong>
          <span style={{ color: "var(--ink-3)" }}>
            {" "}
            · cliente{" "}
            {review.client?.full_name ?? (
              <em style={{ color: "var(--ink-4)" }}>desconocido</em>
            )}
          </span>
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 13.5, color: "var(--ink-3)" }}>
          Sin candidato — el matcher no encontró ninguna apertura de enlace
          compatible.
        </div>
      )}
      {evidenceLines.length > 0 && (
        <details
          style={{
            marginTop: 8,
            fontSize: 11.5,
            color: "var(--ink-4)",
          }}
        >
          <summary style={{ cursor: "pointer" }}>Ver evidencia</summary>
          <div
            style={{
              marginTop: 8,
              padding: 10,
              background: "var(--surface)",
              borderRadius: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              lineHeight: 1.6,
            }}
          >
            {evidenceLines.map(({ k, v }) => (
              <div key={k}>
                <span style={{ color: "var(--ink-4)" }}>{k}:</span>{" "}
                <span style={{ color: "var(--ink-2)" }}>{v}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        marginTop: 12,
        padding: "8px 10px",
        background: "var(--warn-bg)",
        color: "var(--warn)",
        borderRadius: 8,
        fontSize: 12.5,
      }}
    >
      {message}
    </div>
  );
}

function ModeChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        background: active ? "var(--ink)" : "var(--surface)",
        color: active ? "var(--surface)" : "var(--ink-3)",
        border: "1px solid var(--line-strong)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  color: "var(--ink-4)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 600,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  color: "var(--ink-4)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--surface)",
  color: "var(--ink)",
};
