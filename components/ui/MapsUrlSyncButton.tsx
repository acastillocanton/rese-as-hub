"use client";

import { useState, useTransition } from "react";
import { Link2 } from "lucide-react";

/**
 * Botón "Sincronizar enlaces de reseñas" (§4.54). NO cosecha en el servidor
 * (imposible: necesita un Chrome real). Deja una petición; el agente del PC de
 * oficina la recoge en ~1 min y rellena los enlaces directos para todos los
 * gestores. Solo admin + reviews_manager (gateado en /api/sync/maps-urls).
 */
export function MapsUrlSyncButton({
  label = "Sincronizar enlaces",
  size = "md",
  variant = "ghost",
}: {
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "ghost";
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "warn">("ok");

  function onClick() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/sync/maps-urls", { method: "POST" });
        let data: { ok?: boolean; pending?: number; error?: string } | null = null;
        try { data = await res.json(); } catch { /* no-json */ }
        if (!res.ok || !data?.ok) {
          setTone("warn");
          setFeedback(`No se pudo solicitar (${data?.error ?? `HTTP ${res.status}`}).`);
          return;
        }
        setTone("ok");
        setFeedback(
          (data.pending ?? 0) === 0
            ? "No hay enlaces pendientes. Todo al día."
            : `Solicitado · ${data.pending} reseña${data.pending === 1 ? "" : "s"} sin enlace. El PC de oficina lo procesará en ~1 min (si está encendido).`,
        );
      } catch (err) {
        setTone("warn");
        setFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  const styles: React.CSSProperties =
    variant === "primary"
      ? { background: "var(--ink)", color: "#fff", border: "1px solid var(--ink)" }
      : { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line-strong)" };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-busy={isPending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: size === "sm" ? "6px 11px" : "7px 13px",
          fontSize: size === "sm" ? 12.5 : 13,
          fontWeight: 500,
          borderRadius: 9,
          cursor: isPending ? "default" : "pointer",
          opacity: isPending ? 0.7 : 1,
          ...styles,
        }}
        title="Pide al PC de oficina que rellene los enlaces directos a cada reseña en Google"
      >
        <Link2 size={14} aria-hidden />
        {isPending ? "Solicitando…" : label}
      </button>
      {feedback && (
        <span
          role={tone === "warn" ? "alert" : "status"}
          style={{ fontSize: 12, color: tone === "warn" ? "var(--warn, #b35900)" : "var(--ink-3)", maxWidth: 440 }}
        >
          {feedback}
        </span>
      )}
    </div>
  );
}
