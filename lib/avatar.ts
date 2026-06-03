// Lógica compartida de subida de avatares al bucket público `avatars`.
// Server-only: usa el service-client (bypasea RLS) para poder escribir tanto
// el avatar propio (/perfil) como el de otro usuario que un admin/gestor/
// director gestiona (/comerciales/[slug], /directores/[slug]).
//
// El path siempre es `${targetId}/avatar.${ext}` — coherente con las policies
// del bucket (`{user_id}/`) para el caso self-service y con el service-role
// para el caso gestionado.
import { createServiceClient } from "@/lib/supabase/service";

export const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_AVATAR_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

type AvatarExt = "png" | "jpg" | "webp";

function extFor(mime: string): AvatarExt | null {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  return null;
}

/**
 * Valida un File de avatar (tipo + tamaño) y devuelve la extensión destino.
 */
export function validateAvatarFile(
  file: unknown,
): { ok: true; ext: AvatarExt } | { ok: false; error: string } {
  if (!(file instanceof File)) {
    return { ok: false, error: "Archivo no recibido." };
  }
  if (!ACCEPTED_AVATAR_MIME.includes(file.type as (typeof ACCEPTED_AVATAR_MIME)[number])) {
    return { ok: false, error: "Formato no soportado. Usa PNG, JPG o WebP." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Archivo demasiado grande. Máximo 4 MB." };
  }
  const ext = extFor(file.type);
  if (!ext) return { ok: false, error: "Formato no soportado." };
  return { ok: true, ext };
}

/**
 * Valida + sube el avatar de `targetId` al bucket y devuelve la URL pública
 * (con cache-buster). NO toca la tabla `profiles` — el caller decide cómo
 * persistir `avatar_url` (con el role-guard que corresponda) y qué revalidar.
 */
export async function storeUserAvatar(
  targetId: string,
  file: unknown,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const valid = validateAvatarFile(file);
  if (!valid.ok) return valid;
  const f = file as File;

  const service = createServiceClient();
  const path = `${targetId}/avatar.${valid.ext}`;
  const buffer = Buffer.from(await f.arrayBuffer());

  const { error: uploadError } = await service.storage
    .from("avatars")
    .upload(path, buffer, {
      upsert: true,
      contentType: f.type,
      cacheControl: "3600",
    });
  if (uploadError) {
    return { ok: false, error: `Storage: ${uploadError.message}` };
  }

  const { data: publicUrlData } = service.storage
    .from("avatars")
    .getPublicUrl(path);
  if (!publicUrlData?.publicUrl) {
    return { ok: false, error: "No se pudo obtener la URL pública del avatar." };
  }
  return { ok: true, url: `${publicUrlData.publicUrl}?v=${Date.now()}` };
}

/**
 * Borra los objetos de avatar de `targetId` (las 3 extensiones posibles).
 * No falla si no existen. No toca `profiles`.
 */
export async function removeUserAvatarObjects(targetId: string): Promise<void> {
  const service = createServiceClient();
  await service.storage
    .from("avatars")
    .remove([
      `${targetId}/avatar.png`,
      `${targetId}/avatar.jpg`,
      `${targetId}/avatar.webp`,
    ]);
}
