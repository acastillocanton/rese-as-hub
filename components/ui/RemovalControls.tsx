"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markReviewRemoved, restoreReview } from "@/app/(profile)/resenas/verificacion/actions";

/**
 * Controles de soft-delete para una reseña:
 *   - Si `removedAt` es null → botón "Marcar eliminada en Google".
 *   - Si `removedAt` tiene valor → muestra "Eliminada {fecha}" + botón "Restaurar".
 *
 * Se renderiza inline. Acceso: admin + reviews_manager (gateado en las
 * server actions correspondientes).
 */
export function RemovalControls({
  reviewId,
  removedAt,
  size = "sm",
}: {
  reviewId: string;
  removedAt: string | null;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onMark() {
    const ok = window.confirm(
      "¿Marcar esta reseña como eliminada en Google?\n\nDejará de contar en stats y desaparecerá de los listados. Podrás restaurarla si la marcaste por error.",
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const r = await markReviewRemoved(reviewId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function onRestore() {
    setError(null);
    startTransition(async () => {
      const r = await restoreReview(reviewId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  const btnStyle: React.CSSProperties = {
    padding: size === "sm" ? "5px 9px" : "7px 11px",
    fontSize: size === "sm" ? 11.5 : 12.5,
    fontWeight: 500,
    border: "1px solid var(--line-strong)",
    borderRadius: 7,
    background: "var(--surface)",
    color: "var(--ink)",
    cursor: isPending ? "default" : "pointer",
    opacity: isPending ? 0.6 : 1,
  };

  if (removedAt) {
    const fmt = new Date(removedAt).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    return (
      <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <span
          style={{
            fontSize: 11,
            color: "var(--ink-4)",
            fontStyle: "italic",
          }}
        >
          Eliminada en Google · {fmt}
        </span>
        <button type="button" onClick={onRestore} disabled={isPending} style={btnStyle}>
          {isPending ? "…" : "Restaurar"}
        </button>
        {error && (
          <span role="alert" style={{ fontSize: 11, color: "var(--warn, #b35900)" }}>
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button type="button" onClick={onMark} disabled={isPending} style={btnStyle}>
        {isPending ? "…" : "Marcar eliminada"}
      </button>
      {error && (
        <span role="alert" style={{ fontSize: 11, color: "var(--warn, #b35900)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
