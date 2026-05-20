"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { slugify } from "@/lib/utils";

const inviteSchema = z.object({
  fullName: z.string().min(2, "Nombre demasiado corto.").max(120),
  email: z.string().email("Email inválido."),
  phone: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  locationId: z.string().uuid("Selecciona una ficha."),
  monthlyGoal: z.coerce.number().int().min(0).max(1000),
});

export type InviteSalesInput = z.infer<typeof inviteSchema>;

export async function inviteSales(input: InviteSalesInput): Promise<
  | { ok: true; inviteLink: string; email: string }
  | { ok: false; error: string }
> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const baseSlug = slugify(parsed.data.fullName);
  if (!baseSlug) {
    return { ok: false, error: "No se pudo generar el identificador del comercial." };
  }

  const admin = createServiceClient();

  // Reject duplicate slugs early — the admin can adjust the name to disambiguate.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("slug", baseSlug)
    .maybeSingle<{ id: string }>();
  if (existing) {
    return {
      ok: false,
      error: `Ya existe un comercial con el slug "${baseSlug}". Cambia el nombre o añade un apellido.`,
    };
  }

  const headerStore = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    `https://${headerStore.get("host") ?? "localhost:3000"}`;

  // Generate an invite link (no email sent — we hand it to the admin to share).
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: parsed.data.email,
    options: {
      redirectTo: `${origin}/auth/callback?next=/panel`,
      data: { full_name: parsed.data.fullName },
    },
  });

  if (linkError || !linkData?.user?.id || !linkData?.properties?.action_link) {
    console.error("[comerciales] generateLink failed:", linkError);
    if (linkError?.code === "email_exists") {
      return { ok: false, error: "Este email ya está registrado." };
    }
    return { ok: false, error: linkError?.message ?? "No se pudo crear la invitación." };
  }

  const newUserId = linkData.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: newUserId,
    full_name: parsed.data.fullName.trim(),
    role: "sales",
    location_id: parsed.data.locationId,
    slug: baseSlug,
    email: parsed.data.email,
    phone: parsed.data.phone,
    monthly_goal: parsed.data.monthlyGoal,
    status: "invited",
  } as never);

  if (profileError) {
    // Roll back the auth user so we don't leave it orphaned.
    await admin.auth.admin.deleteUser(newUserId);
    console.error("[comerciales] profile insert failed:", profileError);
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/comerciales");
  return { ok: true, inviteLink: linkData.properties.action_link, email: parsed.data.email };
}

export async function deleteSales(id: string) {
  if (!id) return { error: "Id inválido." };
  const supabase = await createClient();
  // The middleware already enforces admin-only access to this route, and RLS
  // backs that up: only the admin can delete a sales profile.
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) {
    console.error("[comerciales] deleteSales failed:", error);
    return { error: error.message };
  }
  // Also wipe the auth.users row so the slot is free for re-invitation.
  const admin = createServiceClient();
  await admin.auth.admin.deleteUser(id);
  revalidatePath("/comerciales");
  return { ok: true };
}
