"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInvitedProfile } from "@/lib/invite";
import { generateAccessLink } from "@/lib/auth/resend-link";
import { shortNameForSlug, slugify } from "@/lib/utils";
import { recordAudit } from "@/lib/audit";
import { storeUserAvatar, removeUserAvatarObjects } from "@/lib/avatar";
import type { Role } from "@/lib/supabase/types";
import { canManageSales } from "@/lib/supabase/types";
import {
  commissionCapSchema,
  commissionRateSchema,
  departmentSchema,
  inviteSlugSchema,
  pauseReasonSchema,
} from "@/lib/validation/sales-schemas";

type Actor = { role: Role; locationId: string | null; userId: string };

/**
 * Comprueba que el caller puede administrar comerciales (admin,
 * reviews_manager o office_director). Defensa en profundidad sobre el gating
 * de la UI y la RLS — los server actions son endpoints HTTP y un atacante
 * autenticado pero sin rol suficiente no debe poder dispararlos aunque
 * conozca la URL.
 *
 * Devuelve también el `locationId` del actor para que las acciones
 * downstream puedan forzar el scope cuando el actor sea office_director.
 */
async function assertCanManageSales(): Promise<
  { ok: true; actor: Actor } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };
  const { data } = await supabase
    .from("profiles")
    .select("role, location_id")
    .eq("id", user.id)
    .maybeSingle<{ role: Role; location_id: string | null }>();
  if (!data || !canManageSales(data.role)) {
    return { ok: false, error: "No autorizado." };
  }
  return { ok: true, actor: { role: data.role, locationId: data.location_id, userId: user.id } };
}

/**
 * Valida que un `directorId` candidato es coherente:
 *  • Existe y tiene `role='office_director'`.
 *  • Su `location_id` coincide con `locationId` del sales (mismo office).
 *  • Status no `archived` (no asignar a directores eliminados).
 *
 * Devuelve `{ ok: true }` también si `directorId` es null (sin director).
 */
async function assertDirectorAssignment(
  directorId: string | null,
  locationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!directorId) return { ok: true };
  const admin = createServiceClient();
  const { data } = await admin
    .from("profiles")
    .select("id, role, location_id, status")
    .eq("id", directorId)
    .maybeSingle<{ id: string; role: Role; location_id: string | null; status: string }>();
  if (!data) return { ok: false, error: "Director responsable no encontrado." };
  if (data.role !== "office_director") {
    return { ok: false, error: "El usuario seleccionado no es un director de oficina." };
  }
  if (data.status === "archived") {
    return { ok: false, error: "Ese director está archivado." };
  }
  if (data.location_id !== locationId) {
    return { ok: false, error: "El director debe pertenecer a la misma ficha que el comercial." };
  }
  return { ok: true };
}

/**
 * Para office_director: valida que la acción afecte SOLO a un sales de su
 * ficha. Lee el target sales y compara su `location_id` con el del actor.
 * Admin y reviews_manager pasan sin chequeo (no tienen scope).
 */
async function assertSalesInScope(
  actor: Actor,
  targetSalesId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (actor.role !== "office_director") return { ok: true };
  if (!actor.locationId) {
    return { ok: false, error: "Director sin oficina asignada." };
  }
  const admin = createServiceClient();
  const { data } = await admin
    .from("profiles")
    .select("location_id, role")
    .eq("id", targetSalesId)
    .maybeSingle<{ location_id: string | null; role: Role }>();
  if (!data || data.role !== "sales") {
    return { ok: false, error: "Comercial no encontrado." };
  }
  if (data.location_id !== actor.locationId) {
    return { ok: false, error: "Comercial fuera de tu oficina." };
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

const inviteSchema = z
  .object({
    fullName: z.string().min(2, "Nombre demasiado corto.").max(120),
    /** Slug público editable (decisión 2026-06-11: nombre + primer apellido).
     *  null → la action lo genera con shortNameForSlug. */
    slug: inviteSlugSchema,
    email: z.string().email("Email inválido."),
    phone: z
      .string()
      .max(40)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    locationId: z.string().uuid("Selecciona una ficha."),
    /** Opcional. Si se asigna, el comercial pertenecerá al equipo de ese
     *  director (su `director_id`); si se deja null, queda en el pool del
     *  admin/reviews_manager. Validamos coherencia con la location en la
     *  server action. */
    directorId: z
      .string()
      .uuid()
      .optional()
      .nullable()
      .transform((v) => v || null),
    monthlyGoal: z.coerce.number().int().min(0).max(1000),
    commissionRate: commissionRateSchema,
    commissionCap: commissionCapSchema,
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
  // Director: solo puede crear sales en SU ficha y para SU equipo. La UI no
  // expone otras locations ni otros directores, pero un POST manipulado podría.
  if (auth.actor.role === "office_director") {
    if (!auth.actor.locationId) {
      return { ok: false, error: "Director sin oficina asignada." };
    }
    if (parsed.data.locationId !== auth.actor.locationId) {
      return { ok: false, error: "Solo puedes crear comerciales en tu oficina." };
    }
    // El director siempre se auto-asigna el sales (ignoramos cualquier
    // directorId que venga del form distinto al suyo).
    parsed.data.directorId = auth.actor.userId;
  }

  // Validar coherencia del director (si se especificó): rol, location, status.
  const dirCheck = await assertDirectorAssignment(
    parsed.data.directorId,
    parsed.data.locationId,
  );
  if (!dirCheck.ok) return { ok: false, error: dirCheck.error };
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
      director_id: parsed.data.directorId,
      monthly_goal: parsed.data.monthlyGoal,
      commission_rate: parsed.data.commissionRate,
      commission_cap: parsed.data.commissionCap,
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
    phone: z
      .string()
      .max(40)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    monthlyGoal: z.coerce.number().int().min(0).max(1000),
    commissionRate: commissionRateSchema,
    commissionCap: commissionCapSchema,
    locationId: z.string().uuid("Selecciona una ficha."),
    directorId: z
      .string()
      .uuid()
      .optional()
      .nullable()
      .transform((v) => v || null),
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
  // Director: el sales target debe estar en su equipo. NO puede:
  //  • Mover un sales a otra ficha.
  //  • Reasignar el sales a otro director (la fila debe seguir apuntando a él).
  // Admin/reviews_manager sí pueden cambiar director_id libremente.
  if (auth.actor.role === "office_director") {
    const inScope = await assertSalesInScope(auth.actor, parsed.data.id);
    if (!inScope.ok) return { ok: false as const, error: inScope.error };
    if (parsed.data.locationId !== auth.actor.locationId) {
      return { ok: false as const, error: "No puedes mover un comercial fuera de tu oficina." };
    }
    if (parsed.data.directorId !== auth.actor.userId) {
      return { ok: false as const, error: "No puedes reasignar el comercial a otro director." };
    }
  }

  // Validar coherencia del director nuevo (si se especifica).
  const dirCheck = await assertDirectorAssignment(
    parsed.data.directorId,
    parsed.data.locationId,
  );
  if (!dirCheck.ok) return { ok: false as const, error: dirCheck.error };

  const supabase = await createClient();
  // RLS: pueden hacer UPDATE en filas role='sales' → admin (profiles_admin_all),
  // reviews_manager (profiles_manager_update_sales, mig 005) y office_director
  // sobre SU equipo (profiles_director_update_sales, mig 013: USING + WITH CHECK
  // exigen director_id = auth.uid()). El scope del director se refuerza arriba
  // en código (assertSalesInScope + forzado de location/director). Middleware
  // también gatea esta ruta.
  const payload = {
    phone: parsed.data.phone,
    monthly_goal: parsed.data.monthlyGoal,
    commission_rate: parsed.data.commissionRate,
    commission_cap: parsed.data.commissionCap,
    location_id: parsed.data.locationId,
    director_id: parsed.data.directorId,
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

  // Traza de la tarifa y el tope de comisión (campos que afectan a pagos).
  await recordAudit({
    entityType: "profile",
    entityId: parsed.data.id,
    action: "update_commission_rate",
    payload: {
      commission_rate: parsed.data.commissionRate,
      commission_cap: parsed.data.commissionCap,
      actor_id: auth.actor.userId,
    },
  });

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
  const inScope = await assertSalesInScope(auth.actor, id);
  if (!inScope.ok) return inScope;

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
  const inScope = await assertSalesInScope(auth.actor, id);
  if (!inScope.ok) return { error: inScope.error };

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
/**
 * Eliminación PERMANENTE de un comercial: borra el profile + el auth.user.
 * En cascada:
 *   • `clients` con ese sales_id → ON DELETE CASCADE → desaparecen.
 *   • `share_links` con ese sales_id → ON DELETE CASCADE → desaparecen.
 *   • `reviews` con ese sales_id → ON DELETE SET NULL → quedan huérfanas.
 *
 * Usar SOLO para limpiar comerciales de prueba o errores de alta. Para
 * un comercial real que se va de la empresa, usar archiveSales (soft
 * delete que conserva la atribución de reseñas para el parte Excel).
 */
export async function deleteSales(id: string) {
  if (!id) return { error: "Id inválido." };
  const auth = await assertCanManageSales();
  if (!auth.ok) return { error: auth.error };
  const inScope = await assertSalesInScope(auth.actor, id);
  if (!inScope.ok) return { error: inScope.error };

  const admin = createServiceClient();
  // Borramos profile con service-client para bypasear cualquier policy que
  // pudiera no resolverse en algún edge case. La constraint role='sales'
  // garantiza que no se borre por error un admin o gestor.
  const { error: profileErr } = await admin
    .from("profiles")
    .delete()
    .eq("id", id)
    .eq("role", "sales");
  if (profileErr) {
    console.error("[comerciales] deleteSales failed:", profileErr);
    return { error: profileErr.message };
  }
  // Y el auth.user. Si ya no existe (alguien lo borró desde Supabase
  // a mano), no rompemos la operación — el profile ya está fuera.
  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    console.warn("[comerciales] auth deleteUser (sales) failed:", authErr);
  }

  revalidatePath("/comerciales");
  return { ok: true };
}

export async function restoreSales(id: string) {
  if (!id) return { error: "Id inválido." };
  const auth = await assertCanManageSales();
  if (!auth.ok) return { error: auth.error };
  const inScope = await assertSalesInScope(auth.actor, id);
  if (!inScope.ok) return { error: inScope.error };

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

// ──────────────────────────────────────────────────────────────────────────
// Avatar del comercial (gestionado por admin / reviews_manager / director)
// El director queda acotado a SU oficina (assertSalesInScope, igual que
// resendSalesAccess/archiveSales). Escritura por service-client + role-guard
// 'sales' (el code-gating es la autoridad; ver §4.24). Se bindea `id` con
// .bind(null, id) en el server component, así el client solo manda el File.
// ──────────────────────────────────────────────────────────────────────────

export async function uploadSalesAvatar(
  id: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Id inválido." };
  const auth = await assertCanManageSales();
  if (!auth.ok) return auth;
  const inScope = await assertSalesInScope(auth.actor, id);
  if (!inScope.ok) return inScope;

  const stored = await storeUserAvatar(id, formData.get("file"));
  if (!stored.ok) return stored;

  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: stored.url } as never)
    .eq("id", id)
    .eq("role", "sales");
  if (error) {
    console.error("[comerciales] uploadSalesAvatar failed:", error);
    return { ok: false, error: error.message };
  }

  await recordAudit({
    entityType: "profile",
    entityId: id,
    action: "update_avatar",
    payload: { actor_id: auth.actor.userId },
  });
  revalidatePath("/comerciales");
  revalidatePath(`/comerciales/${id}`);
  return { ok: true, url: stored.url };
}

export async function removeSalesAvatar(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Id inválido." };
  const auth = await assertCanManageSales();
  if (!auth.ok) return auth;
  const inScope = await assertSalesInScope(auth.actor, id);
  if (!inScope.ok) return inScope;

  await removeUserAvatarObjects(id);

  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: null } as never)
    .eq("id", id)
    .eq("role", "sales");
  if (error) {
    console.error("[comerciales] removeSalesAvatar failed:", error);
    return { ok: false, error: error.message };
  }

  await recordAudit({
    entityType: "profile",
    entityId: id,
    action: "remove_avatar",
    payload: { actor_id: auth.actor.userId },
  });
  revalidatePath("/comerciales");
  revalidatePath(`/comerciales/${id}`);
  return { ok: true };
}

function toNoonIso(ymd: string): string {
  const parts = ymd.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const d = parts[2] ?? 0;
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}
