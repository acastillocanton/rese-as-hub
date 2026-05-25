"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInvitedProfile } from "@/lib/invite";
import { generateAccessLink } from "@/lib/auth/resend-link";
import { slugify } from "@/lib/utils";

/**
 * Comprueba que el caller puede administrar comerciales (admin o
 * reviews_manager). Defensa en profundidad sobre el gating de la UI y la
 * RLS — los server actions son endpoints HTTP y un atacante autenticado
 * pero sin rol suficiente no debe poder dispararlos aunque conozca la URL.
 */
async function assertCanManageSales(): Promise<
  { ok: true } | { ok: false; error: string }
> {
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
  if (actor?.role !== "admin" && actor?.role !== "reviews_manager") {
    return { ok: false, error: "No autorizado." };
  }
  return { ok: true };
}

// Validamos `joinedAt` como yyyy-mm-dd (el <input type="date"> emite así).
const ymdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.")
  .refine((v) => {
    const parts = v.split("-").map(Number);
    const y = parts[0] ?? 0;
    const m = parts[1] ?? 0;
    const d = parts[2] ?? 0;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }, "Fecha inválida.");

const departmentSchema = z.enum(["nacional", "internacional", "castellon", "valencia"]);

const pauseReasonSchema = z.enum(["vacaciones", "baja_medica", "permiso_laboral"]);

const inviteSchema = z
  .object({
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
    department: departmentSchema,
    language: z
      .string()
      .max(60)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    joinedAt: ymdSchema.optional().nullable(),
    notes: z
      .string()
      .max(500)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  })
  .refine(
    (v) => (v.department === "internacional" ? !!v.language : !v.language),
    {
      message: "Selecciona el idioma del comercial internacional.",
      path: ["language"],
    },
  );

export type InviteSalesInput = z.input<typeof inviteSchema>;

export async function inviteSales(input: InviteSalesInput): Promise<
  | { ok: true; inviteLink: string; email: string }
  | { ok: false; error: string }
> {
  const auth = await assertCanManageSales();
  if (!auth.ok) return auth;
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const baseSlug = slugify(parsed.data.fullName);
  if (!baseSlug) {
    return { ok: false, error: "No se pudo generar el identificador del comercial." };
  }

  // joined_at en BD es timestamptz. Si el admin no pone fecha, queda el
  // default now() de la columna; si la pone, mandamos un ISO al día 12:00
  // local para no caer en el día anterior por husos horarios.
  const joinedAtIso = parsed.data.joinedAt
    ? toNoonIso(parsed.data.joinedAt)
    : undefined;

  return createInvitedProfile({
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    slug: baseSlug,
    role: "sales",
    extra: {
      location_id: parsed.data.locationId,
      monthly_goal: parsed.data.monthlyGoal,
      department: parsed.data.department,
      language: parsed.data.language,
      notes: parsed.data.notes,
      ...(joinedAtIso ? { joined_at: joinedAtIso } : {}),
    },
    nextPath: "/panel",
    revalidate: ["/comerciales"],
  });
}

const updateSchema = z
  .object({
    id: z.string().uuid(),
    monthlyGoal: z.coerce.number().int().min(0).max(1000),
    locationId: z.string().uuid("Selecciona una ficha."),
    // 'archived' NO se gestiona desde este formulario — solo desde
    // archiveSales/restoreSales (botones dedicados con confirmación).
    status: z.enum(["invited", "active", "paused"]),
    department: departmentSchema,
    language: z
      .string()
      .max(60)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    pausedReason: pauseReasonSchema.optional().nullable(),
    joinedAt: ymdSchema.optional().nullable(),
    notes: z
      .string()
      .max(500)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  })
  .refine(
    (v) => (v.department === "internacional" ? !!v.language : !v.language),
    {
      message: "Selecciona el idioma del comercial internacional.",
      path: ["language"],
    },
  )
  .refine((v) => (v.status === "paused" ? !!v.pausedReason : true), {
    message: "Selecciona el motivo de la pausa.",
    path: ["pausedReason"],
  });

export type UpdateSalesInput = z.input<typeof updateSchema>;

export async function updateSales(input: UpdateSalesInput) {
  const auth = await assertCanManageSales();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  // RLS: admin (profiles_admin_all) + reviews_manager (profiles_manager_update_sales
  // de la migración 005) son los únicos que pueden hacer UPDATE en filas con
  // role='sales'. Middleware también gatea esta ruta.
  const payload = {
    monthly_goal: parsed.data.monthlyGoal,
    location_id: parsed.data.locationId,
    status: parsed.data.status,
    department: parsed.data.department,
    language: parsed.data.language,
    notes: parsed.data.notes,
    // Coherente con la check constraint paused_requires_reason: si el estado
    // no es 'paused', limpiamos el motivo para no dejarlo huérfano.
    paused_reason: parsed.data.status === "paused" ? parsed.data.pausedReason : null,
    ...(parsed.data.joinedAt ? { joined_at: toNoonIso(parsed.data.joinedAt) } : {}),
  };

  const { error } = await supabase
    .from("profiles")
    .update(payload as never)
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

export async function resendSalesAccess(id: string): Promise<
  | { ok: true; link: string; email: string }
  | { ok: false; error: string }
> {
  if (!id) return { ok: false, error: "Id inválido." };
  const auth = await assertCanManageSales();
  if (!auth.ok) return auth;

  const admin = createServiceClient();
  const { data: target } = await admin
    .from("profiles")
    .select("email")
    .eq("id", id)
    .eq("role", "sales")
    .maybeSingle<{ email: string | null }>();
  if (!target?.email) {
    return { ok: false, error: "Este comercial no tiene email registrado." };
  }
  return generateAccessLink(target.email, "/panel");
}

/**
 * Archiva (soft delete) un comercial. NO borra ni la fila de `profiles` ni
 * `auth.users`: simplemente lo marca como `status='archived'`, libera el
 * slug original (sufijo `-archived-<8 chars>`) y anonimiza el email del
 * profile (para que otro comercial pueda reusarlo si hace falta).
 *
 * Las reseñas atribuidas mantienen su FK al profile archivado, lo que
 * permite al export Excel calcular la fila "RESEÑAS BAJAS COMERCIALES"
 * del parte de Raquel.
 */
export async function archiveSales(id: string) {
  if (!id) return { error: "Id inválido." };
  const auth = await assertCanManageSales();
  if (!auth.ok) return { error: auth.error };

  const admin = createServiceClient();
  const { data: target } = await admin
    .from("profiles")
    .select("slug, status")
    .eq("id", id)
    .eq("role", "sales")
    .maybeSingle<{ slug: string; status: string }>();
  if (!target) return { error: "Comercial no encontrado." };
  if (target.status === "archived") return { ok: true }; // idempotente

  const archivedSlug = `${target.slug}-archived-${id.slice(0, 8)}`;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      email: null,
      slug: archivedSlug,
      // Coherencia con paused_requires_reason: si estaba pausado, limpiamos.
      paused_reason: null,
    } as never)
    .eq("id", id)
    .eq("role", "sales");

  if (error) {
    console.error("[comerciales] archiveSales failed:", error);
    return { error: error.message };
  }

  revalidatePath("/comerciales");
  revalidatePath(`/comerciales/${target.slug}`);
  revalidatePath(`/comerciales/${archivedSlug}`);
  return { ok: true };
}

/**
 * Restaura un comercial archivado. Vuelve a `status='invited'` (para que
 * Raquel pueda reenviarle acceso) e intenta recuperar el slug original; si
 * está ocupado, mantiene el sufijo `-archived-...`.
 */
export async function restoreSales(id: string) {
  if (!id) return { error: "Id inválido." };
  const auth = await assertCanManageSales();
  if (!auth.ok) return { error: auth.error };

  const admin = createServiceClient();
  const { data: target } = await admin
    .from("profiles")
    .select("slug, status")
    .eq("id", id)
    .eq("role", "sales")
    .maybeSingle<{ slug: string; status: string }>();
  if (!target) return { error: "Comercial no encontrado." };
  if (target.status !== "archived") return { ok: true };

  // Intenta recuperar el slug original quitando el sufijo `-archived-XXXXXXXX`.
  const originalSlug = target.slug.replace(/-archived-[a-f0-9]{8}$/, "");
  let finalSlug = target.slug;
  if (originalSlug !== target.slug) {
    const { data: collision } = await admin
      .from("profiles")
      .select("id")
      .eq("slug", originalSlug)
      .maybeSingle<{ id: string }>();
    if (!collision) finalSlug = originalSlug;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      status: "invited",
      archived_at: null,
      slug: finalSlug,
    } as never)
    .eq("id", id)
    .eq("role", "sales");

  if (error) {
    console.error("[comerciales] restoreSales failed:", error);
    return { error: error.message };
  }

  revalidatePath("/comerciales");
  revalidatePath(`/comerciales/${target.slug}`);
  revalidatePath(`/comerciales/${finalSlug}`);
  return { ok: true };
}

function toNoonIso(ymd: string): string {
  const parts = ymd.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const d = parts[2] ?? 0;
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}
