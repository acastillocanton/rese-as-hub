"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Copy, Check, MessageSquareReply } from "lucide-react";
import { saveReviewReply, clearReviewReply } from "./actions";
import { buildGoogleReviewListUrl } from "@/lib/google/review-url";

const MAX_LEN = 4096;

// Panel del propietario donde SÍ existe el botón "Responder" de Google. La
// lista pública (buildGoogleReviewListUrl) solo sirve para LOCALIZAR la reseña
// — no tiene caja de respuesta. No es deep-link por reseña (Google no lo
// permite sin los IDs internos que solo da la Business Profile API): aterriza
// en el gestor de reseñas; con varias fichas, eliges la ficha allí.
const GBP_REVIEWS_URL = "https://business.google.com/reviews";

/**
 * Composer de respuesta a una reseña (flujo asistido). Patrón de
 * RemovalControls: client component con useTransition + router.refresh().
 *
 * Pendiente → textarea (emojis) + contador + Guardar/Copiar/Abrir en Google.
 * Respondida → resumen (texto + vía + autor + fecha) + Editar/Revertir.
 *
 * Flujo recomendado para el gestor: redactar → "Copiar texto" → "Abrir en
 * Google" (pega y publica en Google) → vuelve y pulsa "Marcar respondida".
 */
export function ReviewReplyComposer({
  reviewId,
  placeId,
  replied,
  initialText,
  repliedAt,
  replierName,
  replyVia,
}: {
  reviewId: string;
  placeId: string | null | undefined;
  replied: boolean;
  initialText: string;
  repliedAt: string | null;
  replierName: string | null;
  replyVia: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);

  const googleUrl = buildGoogleReviewListUrl(placeId);
  const showComposer = !replied || editing;

  function onSave() {
    setError(null);
    startTransition(async () => {
      const r = await saveReviewReply({ reviewId, text });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onClear() {
    const ok = window.confirm(
      "¿Marcar esta reseña como NO respondida?\n\nVolverá a la cola de pendientes. El texto que redactaste se borrará.",
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const r = await clearReviewReply(reviewId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar al portapapeles.");
    }
  }

  const btn: React.CSSProperties = {
    padding: "7px 12px",
    fontSize: 12.5,
    fontWeight: 500,
    border: "1px solid var(--line-strong)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--ink)",
    cursor: isPending ? "default" : "pointer",
    opacity: isPending ? 0.6 : 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
  const btnPrimary: React.CSSProperties = {
    ...btn,
    background: "var(--ink)",
    color: "var(--surface)",
    border: "1px solid var(--ink)",
  };

  // ── Respondida (resumen) ───────────────────────────────────────────────
  if (!showComposer) {
    const viaLabel =
      replyVia === "api"
        ? "Publicada por API"
        : replyVia === "google_detected"
          ? "Detectada en Google"
          : "Respondida (manual)";
    const fmt = repliedAt
      ? new Date(repliedAt).toLocaleString("es-ES", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Madrid",
        })
      : "";
    return (
      <div style={{ marginTop: 4 }}>
        <div
          style={{
            background: "var(--surface-2, rgba(0,0,0,0.03))",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--ink-2)",
            whiteSpace: "pre-wrap",
          }}
        >
          {initialText || <span style={{ color: "var(--ink-4)" }}>(sin texto)</span>}
        </div>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            fontSize: 11.5,
            color: "var(--ink-4)",
          }}
        >
          <span>
            {viaLabel}
            {replierName ? ` · ${replierName}` : ""}
            {fmt ? ` · ${fmt}` : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              setText(initialText);
              setEditing(true);
            }}
            disabled={isPending}
            style={{ ...btn, padding: "5px 9px", fontSize: 11.5 }}
          >
            Editar
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={isPending}
            style={{ ...btn, padding: "5px 9px", fontSize: 11.5 }}
          >
            {isPending ? "…" : "Marcar como no respondida"}
          </button>
          {error && (
            <span role="alert" style={{ color: "var(--warn, #b35900)" }}>
              {error}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Pendiente / edición (composer) ─────────────────────────────────────
  const over = text.trim().length > MAX_LEN;
  return (
    <div style={{ marginTop: 4 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribe tu respuesta… (puedes usar emojis 🙂)"
        rows={3}
        style={{
          width: "100%",
          resize: "vertical",
          padding: "10px 12px",
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: "inherit",
          border: "1px solid var(--line-strong)",
          borderRadius: 8,
          background: "var(--surface)",
          color: "var(--ink)",
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onSave}
          disabled={isPending || text.trim().length === 0 || over}
          style={btnPrimary}
        >
          {isPending ? "Guardando…" : editing ? "Guardar cambios" : "Marcar respondida"}
        </button>
        <button type="button" onClick={onCopy} disabled={text.trim().length === 0} style={btn}>
          {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.75} />}
          {copied ? "Copiado" : "Copiar texto"}
        </button>
        <a
          href={GBP_REVIEWS_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Abre tu panel de propietario de Google (pestaña Reseñas), donde puedes pegar y publicar la respuesta"
          style={btn}
        >
          <MessageSquareReply size={13} strokeWidth={1.75} />
          Responder en Google
        </a>
        {googleUrl && (
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Localiza la reseña en la lista pública (no permite responder)"
            style={btn}
          >
            <ExternalLink size={13} strokeWidth={1.75} />
            Ver reseña
          </a>
        )}
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setText(initialText);
              setError(null);
            }}
            disabled={isPending}
            style={{ ...btn, border: "none", background: "transparent" }}
          >
            Cancelar
          </button>
        )}
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: over ? "var(--warn, #b35900)" : "var(--ink-4)",
          }}
        >
          {text.trim().length} / {MAX_LEN}
        </span>
      </div>
      {error && (
        <div role="alert" style={{ marginTop: 6, fontSize: 11.5, color: "var(--warn, #b35900)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
