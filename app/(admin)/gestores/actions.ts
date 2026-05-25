"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInvitedProfile } from "@/lib/invite";
import { generateAccessLink } from "@/lib/auth/resend-link";
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

// ──────────────────────────────────────────────────────────────────────────
// Directores de oficina — solo admin global puede crear/eliminar/reenviar.
// Comparten pantalla con los reviews_manager en /gestores.
// ──────────────────────────────────────────────────────────────────────────

/** Comprueba que el caller es admin global. Centralizado para no repetir. */
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
    revalidate: ["/gestores"],
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
    console.error("[gestores] delete director failed:", profileErr);
    return { error: profileErr.message };
  }
  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    console.warn("[gestores] auth deleteUser (director) failed:", authErr);
  }
  revalidatePath("/gestores");
  return { ok: true };
}
