"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInvitedProfile } from "@/lib/invite";
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
    revalidate: ["/comerciales"],
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
