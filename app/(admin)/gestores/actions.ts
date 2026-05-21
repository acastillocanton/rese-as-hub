"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInvitedProfile } from "@/lib/invite";
import { slugify } from "@/lib/utils";

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

export async function deleteReviewsManager(id: string) {
  if (!id) return { error: "Id inválido." };
  const supabase = await createClient();
  // El middleware ya garantiza solo-admin para /gestores; la RLS de profiles
  // refuerza que solo admin puede borrar perfiles ajenos.
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", id)
    .eq("role", "reviews_manager");
  if (error) {
    console.error("[gestores] deleteReviewsManager failed:", error);
    return { error: error.message };
  }
  const admin = createServiceClient();
  await admin.auth.admin.deleteUser(id);
  revalidatePath("/gestores");
  return { ok: true };
}
