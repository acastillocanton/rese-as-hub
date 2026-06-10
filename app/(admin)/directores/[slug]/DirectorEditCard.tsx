"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { Pill } from "@/components/ui/Pill";
import { formatEuro } from "@/lib/utils";
import { formatReviewDate } from "@/lib/format";
import { DEPARTMENT_OPTIONS, STATUS_OPTIONS } from "@/lib/constants";
import { updateDirector, type UpdateDirectorInput } from "../actions";
import {
  SALES_LANGUAGES,
  type ProfileStatus,
  type SalesDepartment,
} from "@/lib/supabase/types";

export type DirectorEditCardProps = {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  joinedAt: string;
  locations: { id: string; name: string }[];
  initial: {
    locationId: string | null;
    department: SalesDepartment | null;
    language: string | null;
    monthlyGoal: number;
    commissionRate: number | null;
    commissionCap: number | null;
    status: ProfileStatus;
  };
};

function departmentLabel(d: SalesDepartment | null): string {
  if (!d) return "Sin asignar";
  return DEPARTMENT_OPTIONS.find((o) => o.value === d)?.label ?? d;
}

export function DirectorEditCard({
  id,
  email,
  phone: initialPhone,
  fullName: initialFullName,
  joinedAt,
  locations,
  initial,
}: DirectorEditCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState<string>(initialPhone ?? "");
  const [locationId, setLocationId] = useState(
    initial.locationId ?? locations[0]?.id ?? "",
  );
  const [department, setDepartment] = useState<SalesDepartment | "">(
    initial.department ?? "",
  );
  const [language, setLanguage] = useState<string>(initial.language ?? "");
  const [monthlyGoal, setMonthlyGoal] = useState<number>(initial.monthlyGoal);
  const [commissionRate, setCommissionRate] = useState<string>(
    initial.commissionRate === null ? "" : String(initial.commissionRate),
  );
  const [commissionCap, setCommissionCap] = useState<string>(
    initial.commissionCap === null ? "" : String(initial.commissionCap),
  );
  const initialEditableStatus: Exclude<ProfileStatus, "archived"> =
    initial.status === "archived" ? "invited" : initial.status;
  const [status, setStatus] = useState<Exclude<ProfileStatus, "archived">>(
    initialEditableStatus,
  );

  const currentLocation = locations.find((l) => l.id === locationId);
  const fmtDate = formatReviewDate;

  function onCancel() {
    setFullName(initialFullName);
    setPhone(initialPhone ?? "");
    setLocationId(initial.locationId ?? locations[0]?.id ?? "");
    setDepartment(initial.department ?? "");
    setLanguage(initial.language ?? "");
    setMonthlyGoal(initial.monthlyGoal);
    setCommissionRate(initial.commissionRate === null ? "" : String(initial.commissionRate));
    setCommissionCap(initial.commissionCap === null ? "" : String(initial.commissionCap));
    setStatus(initialEditableStatus);
    setError(null);
    setEditing(false);
  }

  function onSave() {
    setError(null);
    if (fullName.trim().length < 2) {
      setError("El nombre es demasiado corto.");
      return;
    }
    if (!department) {
      setError("Selecciona un departamento.");
      return;
    }
    if (department === "internacional" && !language) {
      setError("Selecciona el idioma del director internacional.");
      return;
    }
    const payload: UpdateDirectorInput = {
      id,
      fullName: fullName.trim(),
      phone: phone.trim() ? phone.trim() : null,
      locationId,
      department,
      language: department === "internacional" ? language : null,
      monthlyGoal,
      commissionRate: commissionRate.trim() === "" ? null : commissionRate.trim(),
      commissionCap: commissionCap.trim() === "" ? null : commissionCap.trim(),
      status,
    };
    startTransition(async () => {
      const r = await updateDirector(payload);
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
        <div style={sectionLabel}>Datos del director</div>
        {!editing && <GhostBtn onClick={() => setEditing(true)}>Editar</GhostBtn>}
      </div>

      <dl style={{ margin: 0, display: "grid", rowGap: 12 }}>
        <div style={rowGrid}>
          <dt style={dtStyle}>Nombre</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                minLength={2}
                maxLength={120}
                style={inputStyle}
              />
            ) : (
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{initialFullName}</span>
            )}
          </dd>
        </div>

        <DataRow label="Email" value={email ?? "—"} mono />

        <div style={rowGrid}>
          <dt style={dtStyle}>Teléfono</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                maxLength={40}
                style={inputStyle}
              />
            ) : (
              <span style={{ fontSize: 13.5 }}>{initialPhone ?? "—"}</span>
            )}
          </dd>
        </div>

        <div style={rowGrid}>
          <dt style={dtStyle}>Alta</dt>
          <dd style={{ margin: 0 }}>
            <span style={{ fontSize: 13.5 }}>{fmtDate(joinedAt)}</span>
          </dd>
        </div>

        <div style={rowGrid}>
          <dt style={dtStyle}>Ficha (oficina)</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
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
                {departmentLabel(initial.department)}
              </span>
            )}
          </dd>
        </div>

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

        <div style={rowGrid}>
          <dt style={dtStyle}>Objetivo mensual</dt>
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

        <div style={rowGrid}>
          <dt style={dtStyle}>Comisión/reseña</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <input
                type="number"
                min={0}
                max={9999}
                step="0.01"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                placeholder="Sin tarifa"
                style={{ ...inputStyle, width: 120 }}
              />
            ) : (
              <span
                style={{
                  fontSize: 13.5,
                  color: initial.commissionRate === null ? "var(--ink-4)" : "var(--ink)",
                }}
              >
                {initial.commissionRate === null
                  ? "Sin tarifa configurada"
                  : `${formatEuro(initial.commissionRate)} / reseña`}
              </span>
            )}
          </dd>
        </div>

        <div style={rowGrid}>
          <dt style={dtStyle}>Reseñas bonificables</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <input
                type="number"
                min={0}
                max={9999}
                step="1"
                value={commissionCap}
                onChange={(e) => setCommissionCap(e.target.value)}
                placeholder="Sin tope"
                style={{ ...inputStyle, width: 120 }}
              />
            ) : (
              <span
                style={{
                  fontSize: 13.5,
                  color: initial.commissionCap === null ? "var(--ink-4)" : "var(--ink)",
                }}
              >
                {initial.commissionCap === null
                  ? "Sin tope (paga todas)"
                  : `máx. ${initial.commissionCap} / periodo`}
              </span>
            )}
          </dd>
        </div>

        <div style={rowGrid}>
          <dt style={dtStyle}>Estado</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as Exclude<ProfileStatus, "archived">)
                }
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
              marginTop: 14,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <GhostBtn onClick={onCancel} disabled={isPending}>
              Cancelar
            </GhostBtn>
            <GhostBtn primary onClick={onSave} disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar"}
            </GhostBtn>
          </div>
        </>
      )}
    </div>
  );
}

function DataRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={rowGrid}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={{ margin: 0 }}>
        <span
          style={{
            fontSize: 13.5,
            fontFamily: mono ? "var(--font-mono)" : undefined,
            color: value === "—" ? "var(--ink-4)" : "var(--ink-2)",
          }}
        >
          {value}
        </span>
      </dd>
    </div>
  );
}

function statusLabel(s: ProfileStatus): string {
  if (s === "active") return "Activo";
  if (s === "paused") return "Pausado";
  if (s === "archived") return "Archivado";
  return "Invitado";
}

const sectionLabel: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: "-0.02em",
};

const dtStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--ink-4)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 500,
};

const rowGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  alignItems: "center",
  gap: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 11px",
  background: "var(--surface)",
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--ink)",
};
