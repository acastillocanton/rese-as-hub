"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FormField as Field, formInputStyle as inputStyle } from "@/components/ui/FormField";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { SALES_LANGUAGES, type SalesDepartment } from "@/lib/supabase/types";
import { DEPARTMENT_OPTIONS } from "@/lib/constants";
import { inviteSales } from "./actions";

type LocationOption = { id: string; name: string };
type DirectorOption = {
  id: string;
  full_name: string;
  location_id: string | null;
};

export function InviteSalesButton({
  locations,
  directors,
}: {
  locations: LocationOption[];
  directors: DirectorOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ link: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [department, setDepartment] = useState<SalesDepartment | "">("");
  const [locationId, setLocationId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  // Sugerencia de ficha por defecto en función del departamento. El admin
  // puede cambiarla en el select, esto solo evita pulsaciones tontas.
  const defaultLocationId = useMemo(() => {
    if (!department) return "";
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const match = (needle: string) =>
      locations.find((l) => norm(l.name).includes(needle))?.id ?? "";
    if (department === "castellon") return match("castell");
    if (department === "valencia") return match("valencia");
    // Nacional e Internacional → Oropesa (ficha principal).
    return match("oropesa");
  }, [department, locations]);

  function close() {
    setOpen(false);
    setError(null);
    setSuccess(null);
    setCopied(false);
    setDepartment("");
    setLocationId("");
  }

  // Directores filtrados por la ficha seleccionada. Cuando la ficha cambia,
  // el dropdown se reduce a los del nuevo location_id; si no hay ficha aún,
  // se ofrece la lista completa para no bloquear al usuario.
  const eligibleDirectors = useMemo(() => {
    if (!locationId) return directors;
    return directors.filter((d) => d.location_id === locationId);
  }, [directors, locationId]);

  // Cuando el departamento autosugiere una ficha (`defaultLocationId`), el
  // <select> se remonta con esa value pero el state aún no lo sabe — lo
  // sincronizamos para que el filtro de directores aplique desde el primer
  // render del form.
  useEffect(() => {
    if (defaultLocationId) setLocationId(defaultLocationId);
  }, [defaultLocationId]);

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
        directorId: String(formData.get("directorId") ?? "") || null,
        monthlyGoal: String(formData.get("monthlyGoal") ?? "5"),
        commissionRate: String(formData.get("commissionRate") ?? ""),
        department: dept,
        language:
          dept === "internacional" ? String(formData.get("language") ?? "") : null,
        joinedAt: String(formData.get("joinedAt") ?? "") || null,
        notes: String(formData.get("notes") ?? "") || null,
      };
      const result = await inviteSales(input as never);
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

  return (
    <>
      <GhostBtn primary onClick={() => setOpen(true)}>
        + Invitar comercial
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
                Nuevo comercial
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
                {success ? "Invitación lista" : "Invitar a la plataforma"}
              </div>
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
                  este enlace y envíaselo por WhatsApp, email o como prefieras —
                  al abrirlo, completará el alta y accederá a su panel.
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
                    <input name="fullName" required minLength={2} maxLength={120} style={inputStyle} />
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
                    label="Departamento"
                    hint="Define en qué hoja del parte semanal aparece"
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
                  <Field label="Ficha asignada" hint="Ficha de Google donde caen sus reseñas">
                    <select
                      name="locationId"
                      required
                      style={inputStyle}
                      // `key` fuerza remount cuando cambia el departamento
                      // para que el defaultValue tome efecto.
                      key={`loc-${department}-${defaultLocationId}`}
                      defaultValue={defaultLocationId}
                      onChange={(e) => setLocationId(e.target.value)}
                    >
                      <option value="" disabled>
                        Selecciona…
                      </option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {/* Director responsable: opcional. Si se asigna, ese director
                      gestionará al comercial; si se deja vacío, queda en el
                      pool del admin/reviews_manager (sin director). Filtramos
                      la lista por la ficha actual para no asignar un director
                      de otra location por error. */}
                  <Field
                    label="Director responsable (opcional)"
                    hint={
                      eligibleDirectors.length === 0
                        ? "No hay directores en esa ficha. Créalos en /directores."
                        : "Solo se listan directores de la ficha seleccionada."
                    }
                  >
                    <select name="directorId" style={inputStyle} defaultValue="">
                      <option value="">— Sin director asignado —</option>
                      {eligibleDirectors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.full_name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Fecha de incorporación">
                    <input
                      name="joinedAt"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Objetivo mensual">
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
                  <Field label="Comisión por reseña (€)" hint="Importe que se abona por cada reseña verificada. Vacío = sin tarifa configurada.">
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
                  <Field label="Notas (opcional)" hint="Aparecerán inline en el parte (p.ej. 'Baja médica hasta el 16 de marzo')">
                    <textarea
                      name="notes"
                      maxLength={500}
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical", minHeight: 56 }}
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

// inputStyle (formInputStyle) y Field (FormField) viven en components/ui/FormField.tsx
