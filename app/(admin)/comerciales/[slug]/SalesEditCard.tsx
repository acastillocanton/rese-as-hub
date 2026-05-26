"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { Pill } from "@/components/ui/Pill";
import { updateSales, type UpdateSalesInput } from "../actions";
import {
  SALES_LANGUAGES,
  type PauseReason,
  type ProfileStatus,
  type SalesDepartment,
} from "@/lib/supabase/types";

export type SalesEditCardProps = {
  id: string;
  email: string | null;
  phone: string | null;
  slug: string;
  joinedAt: string;
  locations: { id: string; name: string }[];
  directors: { id: string; full_name: string; location_id: string | null }[];
  initial: {
    locationId: string | null;
    directorId: string | null;
    monthlyGoal: number;
    status: ProfileStatus;
    department: SalesDepartment | null;
    language: string | null;
    pausedReason: PauseReason | null;
    notes: string | null;
  };
};

const DEPARTMENT_OPTIONS: { value: SalesDepartment; label: string }[] = [
  { value: "nacional", label: "Nacional" },
  { value: "internacional", label: "Internacional" },
  { value: "castellon", label: "Castellón" },
  { value: "valencia", label: "Valencia" },
];

const PAUSE_REASON_OPTIONS: { value: PauseReason; label: string }[] = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "baja_medica", label: "Baja médica" },
  { value: "permiso_laboral", label: "Permiso laboral" },
];

// 'archived' no se gestiona desde este card (lo hace ArchiveSalesButton).
const STATUS_OPTIONS: { value: Exclude<ProfileStatus, "archived">; label: string }[] = [
  { value: "invited", label: "Invitado (no ha entrado)" },
  { value: "active", label: "Activo" },
  { value: "paused", label: "Pausado" },
];

export function SalesEditCard({
  id,
  email,
  phone: initialPhone,
  slug,
  joinedAt,
  locations,
  directors,
  initial,
}: SalesEditCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [phone, setPhone] = useState<string>(initialPhone ?? "");
  const [locationId, setLocationId] = useState(
    initial.locationId ?? locations[0]?.id ?? "",
  );
  const [directorId, setDirectorId] = useState<string>(initial.directorId ?? "");
  const [monthlyGoal, setMonthlyGoal] = useState(initial.monthlyGoal);
  // initial.status puede ser 'archived' si llega aquí por error; en ese caso
  // colapsamos a 'invited' para que el select tenga un valor representable.
  // (La página de detalle muestra otro componente cuando el comercial está
  // archivado, así que este caso no debería darse en la práctica.)
  const initialEditableStatus: Exclude<ProfileStatus, "archived"> =
    initial.status === "archived" ? "invited" : initial.status;
  const [status, setStatus] = useState<Exclude<ProfileStatus, "archived">>(
    initialEditableStatus,
  );
  const [department, setDepartment] = useState<SalesDepartment | "">(
    initial.department ?? "",
  );
  const [language, setLanguage] = useState<string>(initial.language ?? "");
  const [pausedReason, setPausedReason] = useState<PauseReason | "">(
    initial.pausedReason ?? "",
  );
  const [joinedAtInput, setJoinedAtInput] = useState<string>(
    toDateInputValue(joinedAt),
  );
  const [notes, setNotes] = useState<string>(initial.notes ?? "");

  const currentLocation = locations.find((l) => l.id === locationId);
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  function onCancel() {
    setPhone(initialPhone ?? "");
    setLocationId(initial.locationId ?? locations[0]?.id ?? "");
    setDirectorId(initial.directorId ?? "");
    setMonthlyGoal(initial.monthlyGoal);
    setStatus(initialEditableStatus);
    setDepartment(initial.department ?? "");
    setLanguage(initial.language ?? "");
    setPausedReason(initial.pausedReason ?? "");
    setJoinedAtInput(toDateInputValue(joinedAt));
    setNotes(initial.notes ?? "");
    setError(null);
    setEditing(false);
  }

  // Si el director responsable actual pertenece a otra ficha de la que se
  // elige en el form, lo limpiamos para no enviar un par inconsistente.
  // Esta corrección visual ocurre en onChange del select de location.
  const eligibleDirectors = directors.filter((d) => d.location_id === locationId);
  const currentDirector = directors.find((d) => d.id === directorId) ?? null;

  function onSave() {
    setError(null);
    if (!department) {
      setError("Selecciona un departamento.");
      return;
    }
    if (department === "internacional" && !language) {
      setError("Selecciona el idioma del comercial internacional.");
      return;
    }
    if (status === "paused" && !pausedReason) {
      setError("Selecciona el motivo de la pausa.");
      return;
    }
    const payload: UpdateSalesInput = {
      id,
      phone: phone.trim() ? phone.trim() : null,
      locationId,
      directorId: directorId || null,
      monthlyGoal,
      status,
      department,
      language: department === "internacional" ? language : null,
      pausedReason: status === "paused" ? pausedReason || null : null,
      joinedAt: joinedAtInput || null,
      notes: notes.trim() ? notes.trim() : null,
    };
    startTransition(async () => {
      const r = await updateSales(payload);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={sectionLabel}>Datos del comercial</div>
        {!editing && (
          <GhostBtn onClick={() => setEditing(true)}>Editar</GhostBtn>
        )}
      </div>

      <dl style={{ margin: 0, display: "grid", rowGap: 12 }}>
        <DataRow label="Email" value={email ?? "—"} />

        <div style={rowGrid}>
          <dt style={dtStyle}>Teléfono</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                maxLength={40}
                placeholder="+34 …"
                style={inputStyle}
              />
            ) : (
              <span
                style={{
                  fontSize: 13.5,
                  color: initialPhone ? "var(--ink)" : "var(--ink-4)",
                }}
              >
                {initialPhone ?? "—"}
              </span>
            )}
          </dd>
        </div>

        <DataRow label="Slug" mono value={`/c/${slug}`} />

        {/* Alta */}
        <div style={rowGrid}>
          <dt style={dtStyle}>Alta</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <input
                type="date"
                value={joinedAtInput}
                onChange={(e) => setJoinedAtInput(e.target.value)}
                style={inputStyle}
              />
            ) : (
              <span style={{ fontSize: 13.5 }}>{fmtDate(joinedAt)}</span>
            )}
          </dd>
        </div>

        {/* Departamento */}
        <div style={rowGrid}>
          <dt style={dtStyle}>Departamento</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <select
                value={department}
                onChange={(e) => {
                  const v = e.target.value as SalesDepartment | "";
                  setDepartment(v);
                  if (v !== "internacional") setLanguage("");
                }}
                style={inputStyle}
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
            ) : (
              <span style={{ fontSize: 13.5 }}>
                {departmentLabel(initial.department) ?? "Sin asignar"}
              </span>
            )}
          </dd>
        </div>

        {/* Idioma (solo internacional) */}
        {(editing ? department === "internacional" : initial.department === "internacional") && (
          <div style={rowGrid}>
            <dt style={dtStyle}>Idioma</dt>
            <dd style={{ margin: 0 }}>
              {editing ? (
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={inputStyle}
                >
                  <option value="" disabled>
                    Selecciona…
                  </option>
                  {SALES_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: 13.5 }}>{initial.language ?? "—"}</span>
              )}
            </dd>
          </div>
        )}

        {/* Ficha */}
        <div style={rowGrid}>
          <dt style={dtStyle}>Ficha asignada</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <select
                value={locationId}
                onChange={(e) => {
                  const v = e.target.value;
                  setLocationId(v);
                  // Si el director actual pertenecía a la ficha anterior,
                  // se vuelve incoherente — lo limpiamos.
                  if (directorId) {
                    const d = directors.find((x) => x.id === directorId);
                    if (!d || d.location_id !== v) setDirectorId("");
                  }
                }}
                style={inputStyle}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 13.5 }}>
                {currentLocation?.name ?? "—"}
              </span>
            )}
          </dd>
        </div>

        {/* Director responsable (opcional). Solo se ofrecen los de la
            misma ficha; "Sin director" deja al comercial en el pool del
            admin/reviews_manager. */}
        <div style={rowGrid}>
          <dt style={dtStyle}>Director responsable</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <select
                value={directorId}
                onChange={(e) => setDirectorId(e.target.value)}
                style={inputStyle}
              >
                <option value="">— Sin director asignado —</option>
                {eligibleDirectors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 13.5, color: currentDirector ? "var(--ink)" : "var(--ink-4)" }}>
                {currentDirector?.full_name ?? "Sin director asignado"}
              </span>
            )}
          </dd>
        </div>

        {/* Meta */}
        <div style={rowGrid}>
          <dt style={dtStyle}>Meta mensual</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <input
                type="number"
                min={0}
                max={1000}
                value={monthlyGoal}
                onChange={(e) => setMonthlyGoal(Number(e.target.value))}
                style={{ ...inputStyle, width: 100 }}
              />
            ) : (
              <span style={{ fontSize: 13.5 }}>{monthlyGoal} reseñas/mes</span>
            )}
          </dd>
        </div>

        {/* Estado */}
        <div style={rowGrid}>
          <dt style={dtStyle}>Estado</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <select
                value={status}
                onChange={(e) => {
                  const v = e.target.value as Exclude<ProfileStatus, "archived">;
                  setStatus(v);
                  if (v !== "paused") setPausedReason("");
                }}
                style={inputStyle}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Pill
                tone={
                  initial.status === "active"
                    ? "ok"
                    : initial.status === "paused"
                      ? "warn"
                      : "neutral"
                }
                withDot
              >
                {statusLabel(initial.status)}
              </Pill>
            )}
          </dd>
        </div>

        {/* Motivo de pausa (solo pausado) */}
        {(editing ? status === "paused" : initial.status === "paused") && (
          <div style={rowGrid}>
            <dt style={dtStyle}>Motivo</dt>
            <dd style={{ margin: 0 }}>
              {editing ? (
                <select
                  value={pausedReason}
                  onChange={(e) => setPausedReason(e.target.value as PauseReason | "")}
                  style={inputStyle}
                >
                  <option value="" disabled>
                    Selecciona…
                  </option>
                  {PAUSE_REASON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: 13.5 }}>
                  {pauseReasonLabel(initial.pausedReason) ?? "—"}
                </span>
              )}
            </dd>
          </div>
        )}

        {/* Notas */}
        <div style={rowGrid}>
          <dt style={dtStyle}>Notas</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={2}
                style={{ ...inputStyle, resize: "vertical", minHeight: 56 }}
                placeholder="Aparecerán inline en el parte"
              />
            ) : (
              <span style={{ fontSize: 13.5, color: initial.notes ? "var(--ink)" : "var(--ink-4)" }}>
                {initial.notes ?? "—"}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {editing && (
        <>
          {error && (
            <div
              role="alert"
              style={{
                marginTop: 14,
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
          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            <GhostBtn onClick={onCancel} disabled={isPending}>
              Cancelar
            </GhostBtn>
            <GhostBtn primary onClick={onSave} disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar cambios"}
            </GhostBtn>
          </div>
        </>
      )}
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--ink-4)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 600,
};

const rowGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "130px 1fr",
  alignItems: "center",
  gap: 12,
};

const dtStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--ink-4)",
};

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--surface)",
  color: "var(--ink)",
};

function DataRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={rowGrid}>
      <dt style={dtStyle}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontSize: 13.5,
          color: "var(--ink)",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          wordBreak: mono ? "break-all" : "normal",
        }}
      >
        {value}
      </dd>
    </div>
  );
}

function departmentLabel(d: SalesDepartment | null | undefined): string | null {
  if (!d) return null;
  return DEPARTMENT_OPTIONS.find((o) => o.value === d)?.label ?? d;
}

function pauseReasonLabel(r: PauseReason | null | undefined): string | null {
  if (!r) return null;
  return PAUSE_REASON_OPTIONS.find((o) => o.value === r)?.label ?? r;
}

function statusLabel(s: ProfileStatus): string {
  if (s === "active") return "Activo";
  if (s === "paused") return "Pausado";
  if (s === "archived") return "Archivado";
  return "Invitado";
}

function toDateInputValue(iso: string): string {
  // El <input type="date"> exige yyyy-mm-dd. Convertimos el ISO en local.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
