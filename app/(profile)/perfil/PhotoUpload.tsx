"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { uploadAvatar, removeAvatar } from "./actions";

type Props = {
  name: string;
  initialAvatarUrl: string | null;
};

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export function PhotoUpload({ name, initialAvatarUrl }: Props) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("Formato no soportado. Usa PNG, JPG o WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Archivo demasiado grande. Máximo 4 MB.");
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadAvatar(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAvatarUrl(result.url);
      router.refresh();
    } catch (e) {
      console.error("[avatar upload]", e);
      setError(e instanceof Error ? e.message : "Error al subir la foto.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      const result = await removeAvatar();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAvatarUrl(null);
      router.refresh();
    } catch (e) {
      console.error("[avatar remove]", e);
      setError(e instanceof Error ? e.message : "Error al eliminar la foto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
      <Avatar name={name} src={avatarUrl} size={112} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 240 }}>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            if (inputRef.current) inputRef.current.value = "";
          }}
          style={{ display: "none" }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <GhostBtn
            primary
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? "Subiendo…" : avatarUrl ? "Cambiar foto" : "Subir foto"}
          </GhostBtn>
          {avatarUrl && (
            <GhostBtn onClick={handleRemove} disabled={busy}>
              Quitar
            </GhostBtn>
          )}
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--ink-4)",
            lineHeight: 1.5,
          }}
        >
          PNG, JPG o WebP. Máximo 4 MB. Se mostrará en tu sidebar y en cualquier
          listado donde aparezcas.
        </p>
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
    </div>
  );
}
