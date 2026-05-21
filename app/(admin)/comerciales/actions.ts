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

/**
 * Genera invite-link de Supabase + inserta la fila en profiles. Helper
 * común a sales y reviews_manager — la única diferencia es el rol, los
 * campos extra del profile y la ruta a la que redirigimos tras el primer
 * login (panel del comercial vs. dashboard del manager).
 *
 * No se envía email; devolvemos el link al admin para que lo comparta.
 */
async function createInvitedProfile(args: {
  fullName: string;
  email: string;
  phone: string | null;
  slug: string;
  role: "sales" | "reviews_manager";
  extra: Record<string, unknown>;
  nextPath: string;
}): Promise<
  | { ok: true; inviteLink: string; email: string }
  | { ok: false; error: string }
> {
  const admin = createServiceClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("slug", args.slug)
    .maybeSingle<{ id: string }>();
  if (existing) {
    return {
      ok: false,
      error: `Ya existe un perfil con el slug "${args.slug}". Cambia el nombre o añade un apellido.`,
    };
  }

  const headerStore = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    `https://${headerStore.get("host") ?? "localhost:3000"}`;

  // Construimos el URL nosotros con el hashed_token apuntando a /auth/confirm
  // (verifyOtp server-side) para evitar PKCE: el verifier-en-cookies rompía
  // cuando el invitado abría el link desde otro dispositivo.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: args.email,
    options: {
      data: { full_name: args.fullName },
    },
  });

  if (linkError || !linkData?.user?.id || !linkData?.properties?.hashed_token) {
    console.error("[comerciales] generateLink failed:", linkError);
    if (linkError?.code === "email_exists") {
      return { ok: false, error: "Este email ya está registrado." };
    }
    return { ok: false, error: linkError?.message ?? "No se pudo crear la invitación." };
  }

  const newUserId = linkData.user.id;
  const inviteLink = `${origin}/auth/confirm?token_hash=${encodeURIComponent(
    linkData.properties.hashed_token,
  )}&type=invite&next=${encodeURIComponent(args.nextPath)}`;

  const { error: profileError } = await admin.from("profiles").insert({
    id: newUserId,
    full_name: args.fullName.trim(),
    role: args.role,
    slug: args.slug,
    email: args.email,
    phone: args.phone,
    status: "invited",
    ...args.extra,
  } as never);

  if (profileError) {
    // Roll back the auth user so we don't leave it orphaned.
    await admin.auth.admin.deleteUser(newUserId);
    console.error("[comerciales] profile insert failed:", profileError);
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/comerciales");
  return { ok: true, inviteLink, email: args.email };
}

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
  return createInvitedProfile({
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    slug: baseSlug,
    role: "sales",
    extra: {
      location_id: parsed.data.locationId,
      monthly_goal: parsed.data.monthlyGoal,
    },
    nextPath: "/panel",
  });
}

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
  });
}

const updateSchema = z.object({
  id: z.string().uuid(),
  monthlyGoal: z.coerce.number().int().min(0).max(1000),
  locationId: z.string().uuid("Selecciona una ficha."),
  status: z.enum(["invited", "active", "paused"]),
});

export type UpdateSalesInput = z.input<typeof updateSchema>;

export async function updateSales(input: UpdateSalesInput) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  // RLS: only admin can update other profiles (middleware also gates this route).
  const { error } = await supabase
    .from("profiles")
    .update({
      monthly_goal: parsed.data.monthlyGoal,
      location_id: parsed.data.locationId,
      status: parsed.data.status,
    } as never)
    .eq("id", parsed.data.id)
    .eq("role", "sales");

  if (error) {
    console.error("[comerciales] updateSales failed:", error);
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/comerciales");
  revalidatePath(`/comerciales/${parsed.data.id}`);
  return { ok: true as const };
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
