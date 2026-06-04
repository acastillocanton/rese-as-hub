"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { FormField as Field, formInputStyle as inputStyle } from "@/components/ui/FormField";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import type { ProfileStatus } from "@/lib/supabase/types";
import {
  updateReviewsManager,
  uploadManagerAvatar,
  removeManagerAvatar,
} from "./actions";

/**
 * Botón "Editar" por fila de /gestores: abre un modal para que el ADMIN edite
 * el perfil de un gestor (nombre, teléfono, estado) y su foto. El email es
 * read-only (es el acceso; para cambiarlo, reinvitar). Ver CLAUDE.md §4.44.
 */
export function ManagerEditButton({
  id,
  fullName: initialFullName,
  email,
  phone: initialPhone,
  status: initialStatus,
  avatarUrl,
}: {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: ProfileStatus;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const isInvited = initialStatus === "invited";
  const [status, setStatus] = useState<"active" | "paused">(
    initialStatus === "paused" ? "paused" : "active",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
  }

  function onSave() {
    setError(null);
    if (fullName.trim().length < 2) {
      setError("El nombre es demasiado corto.");
      return;
    }
    startTransition(async () => {
      const result = await updateReviewsManager({
        id,
        fullName: fullName.trim(),
        phone: phone.trim() === "" ? null : phone.trim(),
        ...(isInvited ? {} : { status }),
      } as never);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <GhostBtn onClick={() => setOpen(true)}>Editar</GhostBtn>

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
              boxShadow: "0 24px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 500 }}>
                Gestor de reseñas
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
                Editar perfil
              </div>
            </div>

            <div
              style={{
                padding: "18px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <AvatarUploader
                name={fullName || initialFullName}
                initialAvatarUrl={avatarUrl}
                upload={uploadManagerAvatar.bind(null, id)}
                remove={removeManagerAvatar.bind(null, id)}
                size={64}
                hint="PNG, JPG o WebP. Máximo 4 MB."
              />

              <Field label="Nombre completo">
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                  style={inputStyle}
                />
              </Field>

              <Field label="Email" hint="No se edita (es el acceso). Para cambiarlo, reinvita.">
                <input
                  value={email ?? ""}
                  disabled
                  style={{
                    ...inputStyle,
                    fontFamily: "var(--font-mono)",
                    background: "var(--surface-2)",
                    color: "var(--ink-4)",
                  }}
                />
              </Field>

              <Field label="Teléfono (opcional)">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  maxLength={40}
                  style={inputStyle}
                />
              </Field>

              {isInvited ? (
                <Field label="Estado">
                  <div style={{ fontSize: 13, color: "var(--ink-4)", lineHeight: 1.5 }}>
                    Pendiente de aceptar la invitación. El estado pasa a “Activo”
                    automáticamente cuando el gestor entra por primera vez.
                  </div>
                </Field>
              ) : (
                <Field label="Estado">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "active" | "paused")}
                    style={inputStyle}
                  >
                    <option value="active">Activo</option>
                    <option value="paused">Pausado</option>
                  </select>
                </Field>
              )}

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
              <GhostBtn primary type="button" onClick={onSave} disabled={isPending}>
                {isPending ? "Guardando…" : "Guardar"}
              </GhostBtn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
