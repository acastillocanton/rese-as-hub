"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInvitedProfile } from "@/lib/invite";
import { generateAccessLink } from "@/lib/auth/resend-link";
import { slugify } from "@/lib/utils";

/**
 * Asegura que el caller es admin global. Solo admin invita/edita/elimina
 * directores — ni los propios directores ni los reviews_manager pueden
 * crear otros directores (defensa en profundidad sobre el middleware).
 */
async function assertAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
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
  return { ok: true };
}

const inviteDirectorSchema = z.object({
  fullName: z.string().min(2, "Nombre demasiado corto.").max(120),
  email: z.string().email("Email inválido."),
  phone: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  locationId: z.string().uuid("Selecciona la oficina (ficha) del director."),
});

export type InviteDirectorInput = z.input<typeof inviteDirectorSchema>;

export async function inviteOfficeDirector(input: InviteDirectorInput): Promise<
  | { ok: true; inviteLink: string; email: string }
  | { ok: false; error: string }
> {
  const guard = await assertAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = inviteDirectorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const baseSlug = slugify(parsed.data.fullName);
  if (!baseSlug) {
    return { ok: false, error: "No se pudo generar el identificador del director." };
  }
  return createInvitedProfile({
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    slug: baseSlug,
    role: "office_director",
    extra: { location_id: parsed.data.locationId },
    nextPath: "/dashboard",
    revalidate: ["/directores"],
  });
}

export async function resendDirectorAccess(id: string): Promise<
  | { ok: true; link: string; email: string }
  | { ok: false; error: string }
> {
  if (!id) return { ok: false, error: "Id inválido." };
  const guard = await assertAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createServiceClient();
  const { data: target } = await admin
    .from("profiles")
    .select("email")
    .eq("id", id)
    .eq("role", "office_director")
    .maybeSingle<{ email: string | null }>();
  if (!target?.email) {
    return { ok: false, error: "Este director no tiene email registrado." };
  }
  return generateAccessLink(target.email, "/dashboard");
}

/**
 * Elimina un office_director: borra el profile + el auth.user. En cascada:
 * los sales que tenían `director_id = este` quedan con director_id = NULL
 * (ON DELETE SET NULL en la FK). Vuelven al pool del admin/reviews_manager.
 */
export async function deleteOfficeDirector(id: string) {
  if (!id) return { error: "Id inválido." };
  const guard = await assertAdmin();
  if (!guard.ok) return { error: guard.error };

  const admin = createServiceClient();
  const { error: profileErr } = await admin
    .from("profiles")
    .delete()
    .eq("id", id)
    .eq("role", "office_director");
  if (profileErr) {
    console.error("[directores] delete director failed:", profileErr);
    return { error: profileErr.message };
  }
  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    console.warn("[directores] auth deleteUser (director) failed:", authErr);
  }
  revalidatePath("/directores");
  return { ok: true };
}
