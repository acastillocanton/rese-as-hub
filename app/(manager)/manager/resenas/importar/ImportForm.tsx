"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { importManualReview } from "./actions";

type LocationOption = { id: string; name: string };
type SalesOption = {
  id: string;
  full_name: string;
  clients: { id: string; full_name: string }[];
};

type SuccessState = {
  reviewId: string;
  matchState: "counted" | "pending" | "unmatched";
  matchConfidence: number;
};

/** Devuelve "YYYY-MM-DDTHH:mm" en hora local — formato esperado por
 *  `<input type="datetime-local">`. */
function nowLocalForInput(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ImportForm({
  locations,
  sales,
}: {
  locations: LocationOption[];
  sales: SalesOption[];
}) {
  const router = useRouter();

  const [locationId, setLocationId] = useState<string>(locations[0]?.id ?? "");
  const [authorName, setAuthorName] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [text, setText] = useState("");
  const [googleCreatedAt, setGoogleCreatedAt] = useState<string>(nowLocalForInput());

  const [forceAttribution, setForceAttribution] = useState(false);
  const [forcedSalesId, setForcedSalesId] = useState("");
  const [forcedClientId, setForcedClientId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [isPending, startTransition] = useTransition();

  const clientsForSelectedSales = useMemo(() => {
    return sales.find((s) => s.id === forcedSalesId)?.clients ?? [];
  }, [sales, forcedSalesId]);

  function resetForm() {
    setAuthorName("");
    setRating(5);
    setText("");
    setGoogleCreatedAt(nowLocalForInput());
    setForceAttribution(false);
    setForcedSalesId("");
    setForcedClientId("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await importManualReview({
        locationId,
        authorName: authorName.trim(),
        rating,
        text: text.trim() === "" ? null : text,
        googleCreatedAt,
        forcedSalesId: forceAttribution ? forcedSalesId || null : null,
        forcedClientId: forceAttribution ? forcedClientId || null : null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess({
        reviewId: result.reviewId,
        matchState: result.matchState,
        matchConfidence: result.matchConfidence,
      });
      resetForm();
      router.refresh();
    });
  }

  return (
    <Card>
      {success && (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            background: "var(--ok-bg, rgba(0,128,40,0.08))",
            border: "1px solid var(--line)",
            borderRadius: 10,
            fontSize: 13.5,
            color: "var(--ink-2)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Reseña importada ·{" "}
            {success.matchState === "counted"
              ? `Atribuida (confianza ${success.matchConfidence}%)`
              : success.matchState === "pending"
                ? `Pendiente de verificación (confianza ${success.matchConfidence}%)`
                : "Sin atribuir"}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            {success.matchState === "counted" && (
              <>
                Aparecerá en{" "}
                <Link href="/manager/resenas" style={{ color: "var(--ink)" }}>
                  la lista de reseñas
                </Link>
                . Si la atribución fue automática, el comercial recibirá un
                email.
              </>
            )}
            {success.matchState === "pending" && (
              <>
                Revísala en{" "}
                <Link href="/resenas/verificacion" style={{ color: "var(--ink)" }}>
                  Verificación
                </Link>{" "}
                para confirmar o reasignar.
              </>
            )}
            {success.matchState === "unmatched" && (
              <>
                Puedes reasignarla desde{" "}
                <Link
                  href="/resenas/verificacion?state=unmatched"
                  style={{ color: "var(--ink)" }}
                >
                  Verificación → Sin atribuir
                </Link>
                .
              </>
            )}
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Field label="Ficha de Google">
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            style={inputStyle}
            required
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Nombre del autor en Google">
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Ej. Antonio Ramírez"
              style={inputStyle}
              required
              maxLength={200}
            />
            <span style={hintStyle}>
              Si Google solo muestra &ldquo;Un usuario de Google&rdquo;,
              escríbelo tal cual: el matcher lo trata como anónimo.
            </span>
          </Field>

          <Field label="Fecha de la reseña en Google">
            <input
              type="datetime-local"
              value={googleCreatedAt}
              onChange={(e) => setGoogleCreatedAt(e.target.value)}
              style={inputStyle}
              required
            />
            <span style={hintStyle}>
              Hora local. El matcher mira esta hora para buscar visitas al
              enlace en las 48h previas.
            </span>
          </Field>
        </div>

        <Field label="Valoración">
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-pressed={rating >= n}
                aria-label={`${n} estrellas`}
                style={{
                  width: 38,
                  height: 38,
                  border: "1px solid var(--line-strong)",
                  borderRadius: 8,
                  background: rating >= n ? "var(--ink)" : "var(--surface)",
                  color: rating >= n ? "#fff" : "var(--ink-3)",
                  cursor: "pointer",
                  fontSize: 16,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ★
              </button>
            ))}
            <span
              style={{
                alignSelf: "center",
                marginLeft: 8,
                fontSize: 12.5,
                color: "var(--ink-4)",
              }}
            >
              {rating} / 5
            </span>
          </div>
        </Field>

        <Field label="Texto de la reseña (opcional)">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={5000}
            style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
            placeholder="Copia/pega el texto exacto que el cliente publicó. Puede dejarse vacío si la reseña era solo estrellas."
          />
        </Field>

        {/* Atribución manual opcional */}
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: "12px 14px",
            background: "var(--surface)",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              fontSize: 13.5,
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={forceAttribution}
              onChange={(e) => {
                setForceAttribution(e.target.checked);
                if (!e.target.checked) {
                  setForcedSalesId("");
                  setForcedClientId("");
                }
              }}
            />
            Atribuir manualmente a un comercial (saltarse el matcher)
          </label>

          {forceAttribution && (
            <div style={{ marginTop: 12 }}>
              <div
                role="note"
                style={{
                  fontSize: 12.5,
                  color: "var(--ink-3)",
                  background: "var(--warn-bg, rgba(255,170,0,0.08))",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}
              >
                La reseña entrará directamente como <strong>atribuida</strong>{" "}
                al comercial elegido (confianza 100%) y disparará el email
                automático al comercial. Úsalo solo si conoces con certeza
                quién la generó.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Comercial">
                  <select
                    value={forcedSalesId}
                    onChange={(e) => {
                      setForcedSalesId(e.target.value);
                      setForcedClientId("");
                    }}
                    style={inputStyle}
                    required={forceAttribution}
                  >
                    <option value="">— Selecciona —</option>
                    {sales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Cliente (opcional)">
                  <select
                    value={forcedClientId}
                    onChange={(e) => setForcedClientId(e.target.value)}
                    style={inputStyle}
                    disabled={!forcedSalesId}
                  >
                    <option value="">— Sin cliente específico —</option>
                    {clientsForSelectedSales.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: "10px 12px",
              background: "var(--warn-bg, rgba(255,170,0,0.12))",
              color: "var(--warn, #b35900)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <GhostBtn type="button" onClick={resetForm} disabled={isPending}>
            Vaciar formulario
          </GhostBtn>
          <GhostBtn
            primary
            type="submit"
            disabled={
              isPending ||
              !locationId ||
              authorName.trim() === "" ||
              (forceAttribution && !forcedSalesId)
            }
          >
            {isPending ? "Importando…" : "Importar reseña"}
          </GhostBtn>
        </div>
      </form>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 11.5,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  fontSize: 13.5,
  fontFamily: "inherit",
  background: "var(--surface)",
  color: "var(--ink)",
  width: "100%",
};

const hintStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--ink-4)",
  lineHeight: 1.5,
};
