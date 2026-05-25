"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { updateLocationRating } from "./actions";

type Props = {
  id: string;
  name: string;
  averageRating: number | null;
  totalReviewCount: number | null;
  ratingUpdatedAt: string | null;
  ratingSource: "manual" | "google_api" | null;
};

export function EditRatingButton({
  id,
  name,
  averageRating,
  totalReviewCount,
  ratingUpdatedAt,
  ratingSource,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    // El input acepta coma o punto como separador decimal — normalizamos.
    const rawAvg = String(formData.get("averageRating") ?? "").replace(",", ".");
    const rawTotal = String(formData.get("totalReviewCount") ?? "");
    startTransition(async () => {
      const r = await updateLocationRating({
        locationId: id,
        averageRating: rawAvg as unknown as number,
        totalReviewCount: rawTotal as unknown as number,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  const updatedFmt = ratingUpdatedAt
    ? new Date(ratingUpdatedAt).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 2,
          padding: "4px 8px",
          background: "transparent",
          border: "1px dashed var(--line-strong)",
          borderRadius: 7,
          fontSize: 12,
          color: "var(--ink-2)",
          cursor: "pointer",
          fontVariantNumeric: "tabular-nums",
        }}
        title="Editar rating manual"
      >
        {averageRating !== null && totalReviewCount !== null ? (
          <>
            <span style={{ fontWeight: 600 }}>
              {averageRating.toFixed(1).replace(".", ",")} ★ ·{" "}
              {totalReviewCount.toLocaleString("es-ES")}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
              {ratingSource === "google_api" ? "Auto" : "Manual"}
              {updatedFmt ? ` · ${updatedFmt}` : ""}
            </span>
          </>
        ) : (
          <span style={{ color: "var(--ink-4)", fontStyle: "italic" }}>Configurar</span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(20,20,22,0.32)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            style={{
              width: 420,
              maxWidth: "100%",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow:
                "0 24px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)",
            }}
          >
            <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontSize: 12, color: "var(--ink-4)" }}>Rating Google</div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                }}
              >
                {name}
              </div>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 12.5,
                  color: "var(--ink-3)",
                  lineHeight: 1.5,
                }}
              >
                Estos valores aparecen en la cabecera del parte mensual. Cópialos
                desde la ficha real de Google. Cuando la cuota de la API se
                apruebe, el cron los actualizará automáticamente.
              </p>
            </div>
            <form action={onSubmit}>
              <div style={{ padding: "16px 20px", display: "grid", gap: 14 }}>
                <Field label="Valoración media (de 1,0 a 5,0)">
                  <input
                    name="averageRating"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]+([.,][0-9])?"
                    required
                    defaultValue={
                      averageRating !== null
                        ? averageRating.toFixed(1).replace(".", ",")
                        : ""
                    }
                    placeholder="p. ej. 4,9"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Reseñas acumuladas">
                  <input
                    name="totalReviewCount"
                    type="number"
                    min={0}
                    required
                    defaultValue={totalReviewCount ?? ""}
                    placeholder="p. ej. 1567"
                    style={inputStyle}
                  />
                </Field>
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
                  padding: "12px 20px",
                  borderTop: "1px solid var(--line)",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <GhostBtn type="button" onClick={close} disabled={isPending}>
                  Cancelar
                </GhostBtn>
                <GhostBtn primary type="submit" disabled={isPending}>
                  {isPending ? "Guardando…" : "Guardar"}
                </GhostBtn>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  background: "var(--surface)",
  border: "1px solid var(--line-strong)",
  borderRadius: 9,
  fontSize: 13,
  color: "var(--ink)",
  fontVariantNumeric: "tabular-nums",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11.5,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
