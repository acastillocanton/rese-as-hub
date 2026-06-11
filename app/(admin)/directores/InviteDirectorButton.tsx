"use client";

import { useState, useTransition } from "react";
import { FormField as Field, formInputStyle as inputStyle } from "@/components/ui/FormField";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { SALES_LANGUAGES, type SalesDepartment } from "@/lib/supabase/types";
import { DEPARTMENT_OPTIONS } from "@/lib/constants";
import { shortNameForSlug, slugify } from "@/lib/utils";
import { inviteOfficeDirector } from "./actions";

type LocationOption = { id: string; name: string };

export function InviteDirectorButton({
  locations,
  label = "+ Invitar director",
  primary = false,
}: {
  locations: LocationOption[];
  label?: string;
  primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ link: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [department, setDepartment] = useState<SalesDepartment | "">("");
  // Slug público (decisión 2026-06-11: nombre + primer apellido). Se
  // auto-rellena con la heurística mientras el admin no lo toque a mano
  // (nombres de pila compuestos como "María Jesús" necesitan corrección).
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
    setSuccess(null);
    setCopied(false);
    setDepartment("");
    setSlug("");
    setSlugTouched(false);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const dept = String(formData.get("department") ?? "") as SalesDepartment | "";
      const input = {
        fullName: String(formData.get("fullName") ?? ""),
        slug: String(formData.get("slug") ?? "") || null,
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        locationId: String(formData.get("locationId") ?? ""),
        department: dept,
        language:
          dept === "internacional" ? String(formData.get("language") ?? "") : null,
        monthlyGoal: String(formData.get("monthlyGoal") ?? "5"),
        commissionRate: String(formData.get("commissionRate") ?? ""),
        commissionCap: String(formData.get("commissionCap") ?? "5"),
      };
      const result = await inviteOfficeDirector(input as never);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess({ link: result.inviteLink, email: result.email });
    });
  }

  async function copyLink() {
    if (!success) return;
    try {
      await navigator.clipboard.writeText(success.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  const noLocations = locations.length === 0;

  return (
    <>
      <GhostBtn primary={primary} onClick={() => setOpen(true)} disabled={noLocations}>
        {label}
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
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            style={{
              width: 520,
              maxWidth: "100%",
              maxHeight: "calc(100dvh - 48px)",
              display: "flex",
              flexDirection: "column",
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
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 500 }}>
                Nuevo director de oficina
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
                {success ? "Invitación lista" : "Invitar al responsable de una oficina"}
              </div>
              {!success && (
                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: 12.5,
                    color: "var(--ink-3)",
                    lineHeight: 1.55,
                  }}
                >
                  El director gestiona su oficina como un admin: invita
                  comerciales, conecta Google y verifica reseñas — todo
                  restringido a su ficha. No accede a /gestores, /ajustes ni a
                  datos de otras oficinas.
                </p>
              )}
            </div>

            {success ? (
              <div style={{ padding: "18px 22px" }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    color: "var(--ink-2)",
                    lineHeight: 1.55,
                  }}
                >
                  Hemos creado el perfil de <strong>{success.email}</strong>. Copia
                  este enlace y envíaselo — al abrirlo, completará el alta y
                  entrará directo al dashboard de su oficina.
                </p>
                <div
                  style={{
                    marginTop: 14,
                    padding: "10px 12px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--line-strong)",
                    borderRadius: 9,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--ink-2)",
                    wordBreak: "break-all",
                    maxHeight: 120,
                    overflow: "auto",
                  }}
                >
                  {success.link}
                </div>
                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                    Enlace de un solo uso. Si caduca, vuelve a invitar.
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <GhostBtn onClick={close}>Cerrar</GhostBtn>
                    <GhostBtn primary onClick={copyLink}>
                      {copied ? "✓ Copiado" : "Copiar enlace"}
                    </GhostBtn>
                  </div>
                </div>
              </div>
            ) : (
              <form
                action={handleSubmit}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    padding: "18px 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    overflowY: "auto",
                    flex: 1,
                    minHeight: 0,
                  }}
                >
                  <Field label="Nombre completo">
                    <input
                      name="fullName"
                      required
                      minLength={2}
                      maxLength={120}
                      style={inputStyle}
                      onChange={(e) => {
                        if (!slugTouched) {
                          setSlug(slugify(shortNameForSlug(e.target.value)));
                        }
                      }}
                    />
                  </Field>
                  <Field
                    label="Enlace (slug)"
                    hint="Nombre + primer apellido. Corrígelo si el nombre es compuesto (ej.: maria-jesus-lozano)."
                  >
                    <input
                      name="slug"
                      required
                      maxLength={60}
                      pattern="[a-z0-9-]+"
                      title="Solo minúsculas, números y guiones"
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(e.target.value);
                      }}
                      style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                    />
                  </Field>
                  <Field label="Email" hint="Donde recibirá el acceso">
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="off"
                      style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                    />
                  </Field>
                  <Field label="Teléfono (opcional)">
                    <input name="phone" type="tel" maxLength={40} style={inputStyle} />
                  </Field>
                  <Field
                    label="Oficina (ficha)"
                    hint="Donde caen sus reseñas como productor y donde están sus comerciales"
                  >
                    <select name="locationId" required style={inputStyle} defaultValue="">
                      <option value="" disabled>
                        — Selecciona la oficina —
                      </option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Departamento"
                    hint="Define en qué hoja del parte semanal aparece su producción"
                  >
                    <select
                      name="department"
                      required
                      style={inputStyle}
                      value={department}
                      onChange={(e) => setDepartment(e.target.value as SalesDepartment)}
                    >
                      <option value="" disabled>
                        Selecciona…
                      </option>
                      {DEPARTMENT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {department === "internacional" && (
                    <Field label="Idioma" hint="Aparece como ZONA en la hoja Internacional">
                      <select name="language" required style={inputStyle} defaultValue="">
                        <option value="" disabled>
                          Selecciona…
                        </option>
                        {SALES_LANGUAGES.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label="Objetivo mensual" hint="Reseñas/mes que se esperan de él como productor">
                    <input
                      name="monthlyGoal"
                      type="number"
                      min={0}
                      max={1000}
                      defaultValue={5}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Comisión por reseña (€)" hint="Importe por reseña verificada como productor. Vacío = sin tarifa.">
                    <input
                      name="commissionRate"
                      type="number"
                      min={0}
                      max={9999}
                      step="0.01"
                      placeholder="p.ej. 2,50"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Reseñas bonificables" hint="Máximo de reseñas que se pagan por periodo. Vacío = sin tope (paga todas).">
                    <input
                      name="commissionCap"
                      type="number"
                      min={0}
                      max={9999}
                      step="1"
                      defaultValue={5}
                      placeholder="Sin tope"
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
                    padding: "14px 22px",
                    borderTop: "1px solid var(--line)",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    flexShrink: 0,
                    background: "var(--surface)",
                  }}
                >
                  <GhostBtn type="button" onClick={close} disabled={isPending}>
                    Cancelar
                  </GhostBtn>
                  <GhostBtn primary type="submit" disabled={isPending}>
                    {isPending ? "Creando…" : "Crear invitación"}
                  </GhostBtn>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// inputStyle (formInputStyle) y Field (FormField) viven en components/ui/FormField.tsx
