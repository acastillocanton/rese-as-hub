"use client";

import { useState, useTransition } from "react";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { createLocation } from "./actions";
import { BRAND_OPTIONS } from "@/lib/branding";
import type { Brand } from "@/lib/supabase/types";

export function AddFichaButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [brand, setBrand] = useState<Brand>("inseryal");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    const input = {
      name: String(formData.get("name") ?? ""),
      googlePlaceId: String(formData.get("googlePlaceId") ?? ""),
      brand: String(formData.get("brand") ?? "inseryal") as Brand,
    };
    startTransition(async () => {
      const result = await createLocation(input);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setName("");
      setPlaceId("");
      setBrand("inseryal");
    });
  }

  return (
    <>
      <GhostBtn primary onClick={() => setOpen(true)}>
        + Añadir ficha
      </GhostBtn>
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
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <form
            action={handleSubmit}
            style={{
              width: 480,
              maxWidth: "100%",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 18,
              boxShadow:
                "0 24px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "20px 22px 14px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 500 }}>
                Nueva ficha
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
                Añadir ficha de Google Business
              </div>
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 12.5,
                  color: "var(--ink-3)",
                  lineHeight: 1.5,
                }}
              >
                El Place ID lo puedes dejar vacío de momento y rellenarlo
                cuando conectes la cuenta de Google por OAuth.
              </p>
            </div>

            <div
              style={{
                padding: "18px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <Field
                label="Nombre"
                hint="Ej. Inseryal · Oropesa"
              >
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field
                label="Google Place ID (opcional)"
                hint="Lo encuentras en https://developers.google.com/maps/documentation/places/web-service/place-id"
              >
                <input
                  name="googlePlaceId"
                  maxLength={200}
                  value={placeId}
                  onChange={(e) => setPlaceId(e.target.value)}
                  placeholder="ChIJ..."
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
              </Field>
              <Field
                label="Marca"
                hint="Determina las etiquetas, logo del email y plantillas que ven los usuarios asignados a esta ficha."
              >
                <select
                  name="brand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value as Brand)}
                  style={inputStyle}
                >
                  {BRAND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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
                padding: "14px 22px",
                borderTop: "1px solid var(--line)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <GhostBtn type="button" onClick={() => setOpen(false)} disabled={isPending}>
                Cancelar
              </GhostBtn>
              <GhostBtn primary type="submit" disabled={isPending}>
                {isPending ? "Guardando…" : "Guardar ficha"}
              </GhostBtn>
            </div>
          </form>
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
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
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
      {hint && (
        <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--ink-4)" }}>{hint}</div>
      )}
    </div>
  );
}
