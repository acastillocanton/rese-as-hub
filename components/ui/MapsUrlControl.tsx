"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setReviewMapsUrl,
  clearReviewMapsUrl,
} from "@/app/(profile)/resenas/maps-url-actions";
import { isDeepReviewUrl } from "@/lib/google/review-url";

/**
 * Pegado manual del deep-link de una reseña (§4.54, Capa 3). Inline en la
 * lista de reseñas. Acceso: admin + reviews_manager (gateado en la server
 * action). Si la reseña ya tiene deep-link → muestra "Enlace directo ✓" +
 * "Quitar"; si no → un toggle que abre un input para pegar el enlace de
 * "Compartir reseña" de Google Maps.
 */
export function MapsUrlControl({
  reviewId,
  mapsUrl,
}: {
  reviewId: string;
  mapsUrl: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const hasDeepLink = isDeepReviewUrl(mapsUrl);

  function onSave() {
    const url = value.trim();
    if (!url) return;
    setError(null);
    startTransition(async () => {
      const r = await setReviewMapsUrl({ reviewId, url });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      setValue("");
      router.refresh();
    });
  }

  function onClear() {
    setError(null);
    startTransition(async () => {
      const r = await clearReviewMapsUrl(reviewId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  const linkBtn: React.CSSProperties = {
    padding: 0,
    border: "none",
    background: "none",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--ink-3)",
    cursor: isPending ? "default" : "pointer",
    textDecoration: "underline",
    opacity: isPending ? 0.6 : 1,
  };

  if (hasDeepLink && !open) {
    return (
      <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--ok, #1a7f4b)", fontWeight: 600 }}>
          Enlace directo ✓
        </span>
        <button type="button" onClick={() => setOpen(true)} style={linkBtn}>
          Cambiar
        </button>
        <button type="button" onClick={onClear} disabled={isPending} style={linkBtn}>
          {isPending ? "…" : "Quitar"}
        </button>
        {error && (
          <span role="alert" style={{ fontSize: 11, color: "var(--warn, #b35900)" }}>
            {error}
          </span>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={linkBtn}>
        + Enlace directo
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 280 }}>
      <input
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Pega el enlace de 'Compartir reseña'"
        autoFocus
        style={{
          padding: "5px 8px",
          border: "1px solid var(--line-strong)",
          borderRadius: 7,
          fontSize: 11.5,
          fontFamily: "inherit",
          background: "var(--surface)",
          color: "var(--ink)",
        }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={onSave}
          disabled={isPending || !value.trim()}
          style={{
            padding: "5px 11px",
            fontSize: 11.5,
            fontWeight: 500,
            border: "none",
            borderRadius: 7,
            background: "var(--ink)",
            color: "#fff",
            cursor: isPending ? "default" : "pointer",
            opacity: isPending || !value.trim() ? 0.6 : 1,
          }}
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setValue("");
            setError(null);
          }}
          disabled={isPending}
          style={linkBtn}
        >
          Cancelar
        </button>
      </div>
      {error && (
        <span role="alert" style={{ fontSize: 11, color: "var(--warn, #b35900)", lineHeight: 1.4 }}>
          {error}
        </span>
      )}
    </div>
  );
}
