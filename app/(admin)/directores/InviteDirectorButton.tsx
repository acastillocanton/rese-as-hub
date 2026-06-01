"use client";

import { useState, useTransition } from "react";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { SALES_LANGUAGES, type SalesDepartment } from "@/lib/supabase/types";
import { inviteOfficeDirector } from "./actions";

type LocationOption = { id: string; name: string };

const DEPARTMENT_OPTIONS: { value: SalesDepartment; label: string }[] = [
  { value: "nacional", label: "Nacional" },
  { value: "internacional", label: "Internacional" },
  { value: "castellon", label: "Castellón" },
  { value: "valencia", label: "Valencia" },
];

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
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
    setSuccess(null);
    setCopied(false);
    setDepartment("");
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const dept = String(formData.get("department") ?? "") as SalesDepartment | "";
      const input = {
        fullName: String(formData.get("fullName") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        locationId: String(formData.get("locationId") ?? ""),
        department: dept,
        language:
          dept === "internacional" ? String(formData.get("language") ?? "") : null,
        monthlyGoal: String(formData.get("monthlyGoal") ?? "5"),
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
              <form action={handleSubmit}>
                <div
                  style={{
                    padding: "18px 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  <Field label="Nombre completo">
                    <input
                      name="fullName"
                      required
                      minLength={2}
                      maxLength={120}
                      style={inputStyle}
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
