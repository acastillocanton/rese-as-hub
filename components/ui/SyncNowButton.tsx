"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText } from "lucide-react";

type SyncNowResult = {
  ok: boolean;
  locations_processed?: number;
  notify_attempted?: number;
  notify_failed?: number;
  summary?: Array<{
    location_name: string;
    fetched: number;
    new_reviews: number;
    counted: number;
    pending: number;
    unmatched: number;
    error?: string;
  }>;
  error?: string;
};

/**
 * Botón "Sincronizar ahora" reutilizable.
 *
 * Llama a `POST /api/sync/now`:
 *   - Sin `locationId` → admin/manager sincroniza todas, comercial solo la suya.
 *   - Con `locationId` → admin/manager solo esa.
 *
 * Tras la respuesta refresca la página para que las nuevas reseñas aparezcan
 * en la lista actual.
 */
export function SyncNowButton({
  locationId,
  label = "Sincronizar ahora",
  size = "md",
  variant = "primary",
}: {
  locationId?: string;
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "ghost";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"ok" | "warn">("ok");

  function onClick() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/sync/now", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(locationId ? { location_id: locationId } : {}),
        });
        // La respuesta puede no ser JSON si el endpoint agota el tiempo o
        // devuelve una página de error de Vercel (504/500 → HTML). Parsear sin
        // proteger lanzaría "Unexpected token '<'"; mostramos un mensaje claro.
        let data: SyncNowResult | null = null;
        try {
          data = (await res.json()) as SyncNowResult;
        } catch {
          setFeedbackTone("warn");
          setFeedback(
            res.status === 504
              ? "La sincronización tardó demasiado. Vuelve a intentarlo en un momento."
              : `No se pudo sincronizar (HTTP ${res.status}). Vuelve a intentarlo en un momento.`,
          );
          return;
        }
        if (!res.ok || !data.ok) {
          setFeedbackTone("warn");
          setFeedback(`Error: ${data.error ?? `HTTP ${res.status}`}`);
          return;
        }

        const totals = (data.summary ?? []).reduce(
          (acc, s) => ({
            new: acc.new + s.new_reviews,
            counted: acc.counted + s.counted,
            pending: acc.pending + s.pending,
            unmatched: acc.unmatched + s.unmatched,
            errors: acc.errors + (s.error ? 1 : 0),
          }),
          { new: 0, counted: 0, pending: 0, unmatched: 0, errors: 0 },
        );

        setFeedbackTone(totals.errors > 0 ? "warn" : "ok");
        if (totals.new === 0) {
          setFeedback(
            data.locations_processed === 0
              ? "No hay fichas con Place ID configurado."
              : `Sin reseñas nuevas (${data.locations_processed} fichas revisadas).`,
          );
        } else {
          setFeedback(
            `${totals.new} nueva${totals.new === 1 ? "" : "s"} · ${totals.counted} atribuida${
              totals.counted === 1 ? "" : "s"
            } · ${totals.pending} pendiente${totals.pending === 1 ? "" : "s"} · ${
              totals.unmatched
            } sin atribuir${totals.errors > 0 ? ` · ${totals.errors} con error` : ""}`,
          );
          // Solo refrescamos si entró algo nuevo.
          router.refresh();
        }
      } catch (err) {
        setFeedbackTone("warn");
        setFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  const padding = size === "sm" ? "6px 11px" : "7px 13px";
  const fontSize = size === "sm" ? 12.5 : 13;
  const styles: React.CSSProperties =
    variant === "primary"
      ? {
          background: "var(--ink)",
          color: "#fff",
          border: "1px solid var(--ink)",
        }
      : {
          background: "var(--surface)",
          color: "var(--ink)",
          border: "1px solid var(--line-strong)",
        };

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
          padding,
          fontSize,
          fontWeight: 500,
          borderRadius: 9,
          cursor: isPending ? "default" : "pointer",
          opacity: isPending ? 0.7 : 1,
          ...styles,
        }}
        title="Trae las últimas reseñas de Google ahora mismo"
      >
        <MessageSquareText size={14} aria-hidden />
        {isPending ? "Sincronizando…" : label}
      </button>
      {feedback && (
        <span
          role={feedbackTone === "warn" ? "alert" : "status"}
          style={{
            fontSize: 12,
            color: feedbackTone === "warn" ? "var(--warn, #b35900)" : "var(--ink-3)",
            maxWidth: 420,
          }}
        >
          {feedback}
        </span>
      )}
    </div>
  );
}
