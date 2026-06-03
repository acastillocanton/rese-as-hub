"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { storeUserAvatar, removeUserAvatarObjects } from "@/lib/avatar";

type UploadResult = { ok: true; url: string } | { ok: false; error: string };
type RemoveResult = { ok: true } | { ok: false; error: string };

export async function uploadAvatar(formData: FormData): Promise<UploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesión no válida. Vuelve a iniciar sesión." };
  }

  const stored = await storeUserAvatar(user.id, formData.get("file"));
  if (!stored.ok) return stored;

  const service = createServiceClient();
  const { error: updateError } = await service
    .from("profiles")
    .update({ avatar_url: stored.url })
    .eq("id", user.id);

  if (updateError) {
    return { ok: false, error: `Profile: ${updateError.message}` };
  }

  revalidatePath("/perfil");
  return { ok: true, url: stored.url };
}

export async function removeAvatar(): Promise<RemoveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesión no válida." };
  }

  await removeUserAvatarObjects(user.id);

  const service = createServiceClient();
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
