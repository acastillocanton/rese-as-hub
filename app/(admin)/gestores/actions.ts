"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInvitedProfile } from "@/lib/invite";
import { generateAccessLink } from "@/lib/auth/resend-link";
import { slugify } from "@/lib/utils";
import { recordAudit } from "@/lib/audit";
import { storeUserAvatar, removeUserAvatarObjects } from "@/lib/avatar";

const inviteManagerSchema = z.object({
  fullName: z.string().min(2, "Nombre demasiado corto.").max(120),
  email: z.string().email("Email inválido."),
  phone: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
});

export type InviteManagerInput = z.infer<typeof inviteManagerSchema>;

export async function inviteReviewsManager(input: InviteManagerInput): Promise<
  | { ok: true; inviteLink: string; email: string }
  | { ok: false; error: string }
> {
  // ⚠️ Crear un reviews_manager es alta de un rol privilegiado: gating de admin
  // OBLIGATORIO aquí (createInvitedProfile usa service-client y NO comprueba al
  // caller). Sin esto, un sales podía invocar la action por su id desde una ruta
  // permitida y autoinvitarse como gestor (el middleware solo mira el pathname,
  // no qué server action se despacha). Ver CLAUDE.md §4.36 / auditoría 2026-06-17.
  const guard = await assertAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = inviteManagerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const baseSlug = slugify(parsed.data.fullName);
  if (!baseSlug) {
    return { ok: false, error: "No se pudo generar el identificador del gestor." };
  }
  return createInvitedProfile({
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    slug: baseSlug,
    role: "reviews_manager",
    extra: {},
    nextPath: "/manager/resenas",
    revalidate: ["/gestores"],
  });
}

export async function resendManagerAccess(id: string): Promise<
  | { ok: true; link: string; email: string }
  | { ok: false; error: string }
> {
  if (!id) return { ok: false, error: "Id inválido." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };
  const { data: actor } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (actor?.role !== "admin") return { ok: false, error: "No autorizado." };

  const admin = createServiceClient();
  const { data: target } = await admin
    .from("profiles")
    .select("email")
    .eq("id", id)
    .eq("role", "reviews_manager")
    .maybeSingle<{ email: string | null }>();
  if (!target?.email) {
    return { ok: false, error: "Este gestor no tiene email registrado." };
  }
  return generateAccessLink(target.email, "/dashboard");
}

/** Solo admin global puede gestionar (editar/eliminar) gestores. */
async function assertAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (data?.role !== "admin") return { ok: false, error: "No autorizado." };
  return { ok: true, userId: user.id };
}

const updateManagerSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().min(2, "Nombre demasiado corto.").max(120),
  phone: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  // Solo activo/pausado: la transición invited→active la hace el login, no el
  // admin. Si el gestor está invitado, el form omite este campo.
  status: z.enum(["active", "paused"]).optional(),
});

export type UpdateManagerInput = z.infer<typeof updateManagerSchema>;

/**
 * Edita el perfil de un gestor (nombre, teléfono, estado). Solo admin.
 * Email y slug NO se tocan (estables; cambiar el email desincronizaría el
 * login/auth — para eso, reinvitar). Ver CLAUDE.md §4.44.
 */
export async function updateReviewsManager(
  input: UpdateManagerInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateManagerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const guard = await assertAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const payload: Record<string, unknown> = {
    full_name: parsed.data.fullName.trim(),
    phone: parsed.data.phone,
  };
  if (parsed.data.status) payload.status = parsed.data.status;

  // Cookie-client: la RLS `profiles_admin_all` (mig 002) permite al admin el
  // UPDATE. El `.eq("role","reviews_manager")` es defensa en profundidad para
  // no tocar admins/sales por un id manipulado.
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update(payload as never)
    .eq("id", parsed.data.id)
    .eq("role", "reviews_manager");
  if (error) {
    console.error("[gestores] updateReviewsManager failed:", error);
    return { ok: false, error: error.message };
  }

  await recordAudit({
    entityType: "profile",
    entityId: parsed.data.id,
    action: "update_manager",
    payload: { actor_id: guard.userId },
  });
  revalidatePath("/gestores");
  return { ok: true };
}

/** Sube/cambia la foto de un gestor (solo admin). Reutiliza lib/avatar.ts. */
export async function uploadManagerAvatar(
  id: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Id inválido." };
  const guard = await assertAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const stored = await storeUserAvatar(id, formData.get("file"));
  if (!stored.ok) return stored;

  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: stored.url } as never)
    .eq("id", id)
    .eq("role", "reviews_manager");
  if (error) {
    console.error("[gestores] uploadManagerAvatar failed:", error);
    return { ok: false, error: error.message };
  }

  await recordAudit({
    entityType: "profile",
    entityId: id,
    action: "update_avatar",
    payload: { actor_id: guard.userId },
  });
  revalidatePath("/gestores");
  return { ok: true, url: stored.url };
}

/** Quita la foto de un gestor (solo admin). */
export async function removeManagerAvatar(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Id inválido." };
  const guard = await assertAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  await removeUserAvatarObjects(id);

  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: null } as never)
    .eq("id", id)
    .eq("role", "reviews_manager");
  if (error) {
    console.error("[gestores] removeManagerAvatar failed:", error);
    return { ok: false, error: error.message };
  }

  await recordAudit({
    entityType: "profile",
    entityId: id,
    action: "remove_avatar",
    payload: { actor_id: guard.userId },
  });
  revalidatePath("/gestores");
  return { ok: true };
}

export async function deleteReviewsManager(id: string) {
  if (!id) return { error: "Id inválido." };
  const guard = await assertAdmin();
  if (!guard.ok) return { error: guard.error };

  // Usamos service-client para el delete del profile + el auth.user. Bypasea
  // la RLS y evita el caso "admin tiene política pero current_role() no lo
  // resuelve" en algún edge case. Coherente con createInvitedProfile, que
  // también pasa por service-client para crear el perfil + el auth.user.
  const admin = createServiceClient();
  const { error: profileErr } = await admin
    .from("profiles")
    .delete()
    .eq("id", id)
    .eq("role", "reviews_manager");
  if (profileErr) {
    console.error("[gestores] delete profile failed:", profileErr);
    return { error: profileErr.message };
  }

  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    // Si el auth user no se puede borrar (el caso típico es que ya no exista
    // porque alguien lo eliminó manualmente desde Supabase), no rompemos la
    // operación: el profile ya está eliminado y el sidebar lo refleja.
    console.warn("[gestores] auth deleteUser failed:", authErr);
  }

  revalidatePath("/gestores");
  return { ok: true };
}
