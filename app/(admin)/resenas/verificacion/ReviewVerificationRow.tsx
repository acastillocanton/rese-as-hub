"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Stars } from "@/components/ui/Stars";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { Pill } from "@/components/ui/Pill";
import {
  confirmReview,
  rejectReview,
  reassignReview,
} from "./actions";
import { RemovalControls } from "@/components/ui/RemovalControls";

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
  sales: { id: string; full_name: string; slug: string } | null;
  client: { id: string; full_name: string } | null;
  location: { id: string; name: string } | null;
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
}: {
  review: Review;
  salesOptions: SalesOption[];
}) {
  const router = useRouter();
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

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

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

  const evidence = review.match_evidence ?? {};
  const evidenceLines = Object.entries(evidence).map(([k, v]) => {
    const valueStr =
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : JSON.stringify(v);
    return { k, v: valueStr };
  });

  return (
    <Card>
      {/* Cabecera con autor + estrellas + fecha + estado */}
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
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
          <span
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            Confianza {review.match_confidence}%
          </span>
        </div>
      </div>

      {/* Texto de la reseña */}
      {review.text && (
        <p
          style={{
            margin: "14px 0 0",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--ink-2)",
          }}
        >
          {review.text}
        </p>
      )}

      {/* Atribución propuesta */}
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
              {review.client?.full_name ?? <em style={{ color: "var(--ink-4)" }}>desconocido</em>}
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

      {/* Reasignación inline */}
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

      {error && (
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
          {error}
        </div>
      )}

      {/* Acciones */}
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
            <GhostBtn
              onClick={() => setReassigning(true)}
              disabled={isPending}
            >
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
