"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Avatar } from "@/components/ui/Avatar";
import { GhostBtn } from "@/components/ui/GhostBtn";

type Props = {
  userId: string;
  name: string;
  initialAvatarUrl: string | null;
};

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export function PhotoUpload({ userId, name, initialAvatarUrl }: Props) {
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
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );

      // Path por usuario: `{userId}/avatar.{ext}`. Mantenemos un único fichero
      // por usuario sobreescribiendo (upsert: true). Cache-busting con un
      // timestamp en el query string para que el navegador no muestre la
      // versión vieja tras un re-upload.
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "3600",
        });

      if (uploadError) throw new Error(uploadError.message);

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);
      const newUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      // Persistimos la URL en profiles.avatar_url. RLS profiles_self_update
      // permite UPDATE a la propia fila siempre que `role` no cambie.
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: newUrl })
        .eq("id", userId);

      if (updateError) throw new Error(updateError.message);

      setAvatarUrl(newUrl);
      // Refresca server components (sidebar, etc.) para que reflejen la foto
      // sin necesidad de F5 manual.
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
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );

      // Borramos ambos formatos posibles por si quedó un huérfano de un
      // upload anterior con otra extensión. Las que no existan, fallan
      // silenciosamente y no es problema.
      await supabase.storage
        .from("avatars")
        .remove([
          `${userId}/avatar.png`,
          `${userId}/avatar.jpg`,
          `${userId}/avatar.webp`,
        ]);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", userId);

      if (updateError) throw new Error(updateError.message);

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
            // Reset para que el mismo archivo pueda re-subirse después.
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
