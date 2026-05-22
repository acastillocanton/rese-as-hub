"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"] as const;

type UploadResult = { ok: true; url: string } | { ok: false; error: string };
type RemoveResult = { ok: true } | { ok: false; error: string };

function extFor(mime: string): "png" | "jpg" | "webp" | null {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  return null;
}

export async function uploadAvatar(formData: FormData): Promise<UploadResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Archivo no recibido." };
  }
  if (!ACCEPTED.includes(file.type as (typeof ACCEPTED)[number])) {
    return { ok: false, error: "Formato no soportado. Usa PNG, JPG o WebP." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Archivo demasiado grande. Máximo 4 MB." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesión no válida. Vuelve a iniciar sesión." };
  }

  const ext = extFor(file.type);
  if (!ext) return { ok: false, error: "Formato no soportado." };

  const service = createServiceClient();
  const path = `${user.id}/avatar.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await service.storage
    .from("avatars")
    .upload(path, buffer, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

  if (uploadError) {
    return { ok: false, error: `Storage: ${uploadError.message}` };
  }

  const { data: publicUrlData } = service.storage
    .from("avatars")
    .getPublicUrl(path);
  const url = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await service
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", user.id);

  if (updateError) {
    return { ok: false, error: `Profile: ${updateError.message}` };
  }

  revalidatePath("/perfil");
  return { ok: true, url };
}

export async function removeAvatar(): Promise<RemoveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesión no válida." };
  }

  const service = createServiceClient();
  await service.storage
    .from("avatars")
    .remove([
      `${user.id}/avatar.png`,
      `${user.id}/avatar.jpg`,
      `${user.id}/avatar.webp`,
    ]);

  const { error: updateError } = await service
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  revalidatePath("/perfil");
  return { ok: true };
}
