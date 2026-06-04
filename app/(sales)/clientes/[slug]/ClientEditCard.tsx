"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { updateClientRecord, type UpdateClientInput } from "../actions";

export type ClientEditCardProps = {
  id: string;
  initial: {
    fullName: string;
    email: string | null;
    phone: string | null;
  };
  slug: string;
  joinedAt: string;
  salesSlug: string;
};

export function ClientEditCard({
  id,
  initial,
  slug,
  joinedAt,
  salesSlug,
}: ClientEditCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(initial.fullName);
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  function onCancel() {
    setFullName(initial.fullName);
    setEmail(initial.email ?? "");
    setPhone(initial.phone ?? "");
    setError(null);
    setEditing(false);
  }

  function onSave() {
    setError(null);
    const payload: UpdateClientInput = {
      id,
      fullName,
      email: email || null,
      phone: phone || null,
    };
    startTransition(async () => {
      const r = await updateClientRecord(payload);
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
        <div style={sectionLabel}>Datos</div>
        {!editing && <GhostBtn onClick={() => setEditing(true)}>Editar</GhostBtn>}
      </div>

      <dl style={{ margin: 0, display: "grid", rowGap: 12 }}>
        {/* Nombre */}
        <div style={rowGrid}>
          <dt style={dtStyle}>Nombre</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={inputStyle}
                maxLength={120}
              />
            ) : (
              <span style={{ fontSize: 13.5 }}>{initial.fullName}</span>
            )}
          </dd>
        </div>

        {/* Email */}
        <div style={rowGrid}>
          <dt style={dtStyle}>Email</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="opcional@cliente.es"
                style={inputStyle}
                maxLength={120}
              />
            ) : (
              <span style={{ fontSize: 13.5, color: initial.email ? "var(--ink)" : "var(--ink-4)" }}>
                {initial.email ?? "—"}
              </span>
            )}
          </dd>
        </div>

        {/* Teléfono */}
        <div style={rowGrid}>
          <dt style={dtStyle}>Teléfono</dt>
          <dd style={{ margin: 0 }}>
            {editing ? (
              <>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+34 666 123 456"
                  style={inputStyle}
                  maxLength={40}
                />
                <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.45 }}>
                  Para WhatsApp y SMS. Escribe el prefijo del país (ej. +34 España, +40 Rumanía).
                </p>
              </>
            ) : (
              <span style={{ fontSize: 13.5, color: initial.phone ? "var(--ink)" : "var(--ink-4)" }}>
                {initial.phone ?? "—"}
              </span>
            )}
          </dd>
        </div>

        {/* Read-only siempre */}
        <div style={rowGrid}>
          <dt style={dtStyle}>Slug</dt>
          <dd
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
              wordBreak: "break-all",
            }}
          >
            /c/{salesSlug}/{slug}
          </dd>
        </div>
        <div style={rowGrid}>
          <dt style={dtStyle}>Alta</dt>
          <dd style={{ margin: 0, fontSize: 13.5 }}>{fmtDate(joinedAt)}</dd>
        </div>
      </dl>

      {editing && (
        <>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 11.5,
              color: "var(--ink-4)",
              lineHeight: 1.55,
            }}
          >
            El slug del cliente y la URL de su enlace no se modifican aunque
            cambies el nombre. Si tu cliente ya tiene el link enviado, seguirá
            funcionando.
          </p>
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
  gridTemplateColumns: "110px 1fr",
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
  width: "100%",
};
