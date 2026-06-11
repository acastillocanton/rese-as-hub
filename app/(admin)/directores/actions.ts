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
import {
  commissionCapSchema,
  commissionRateSchema,
  departmentSchema,
  inviteSlugSchema,
} from "@/lib/validation/sales-schemas";

/**
 * Asegura que el caller puede administrar directores. Admite admin global y
 * reviews_manager (Bel), que comparte plenamente la gestión de personas
 * con admin. Los office_director NO pueden crear/editar otros directores.
 * Las queries usan service-client para bypass RLS (los gestores no tienen
 * policy de UPDATE/DELETE sobre role='office_director').
 */
async function assertCanManageDirectors(): Promise<
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
  if (data?.role !== "admin" && data?.role !== "reviews_manager") {
    return { ok: false, error: "No autorizado." };
  }
  return { ok: true };
}

// El director es también productor (vende, tiene reseñas, aparece en
// leaderboard/Excel). Por eso pedimos los mismos campos de comercial:
// department, language (si internacional), monthly_goal, commission_rate.
const inviteDirectorSchema = z
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
    locationId: z.string().uuid("Selecciona la oficina (ficha) del director."),
    department: departmentSchema,
    language: z
      .string()
      .max(60)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    monthlyGoal: z.coerce.number().int().min(0).max(1000),
    commissionRate: commissionRateSchema,
    commissionCap: commissionCapSchema,
  })
  .refine(
    (v) => (v.department === "internacional" ? !!v.language : !v.language),
    {
      message: "Selecciona el idioma del director internacional.",
      path: ["language"],
    },
  );

export type InviteDirectorInput = z.input<typeof inviteDirectorSchema>;

export async function inviteOfficeDirector(input: InviteDirectorInput): Promise<
  | { ok: true; inviteLink: string; email: string }
  | { ok: false; error: string }
> {
  const guard = await assertCanManageDirectors();
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = inviteDirectorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  // Slug público: el que tecleó/aceptó el admin en el modal, o la heurística
  // "nombre + primer apellido" como fallback (decisión 2026-06-11).
  const baseSlug =
    parsed.data.slug ?? slugify(shortNameForSlug(parsed.data.fullName));
  if (!baseSlug) {
    return { ok: false, error: "No se pudo generar el identificador del director." };
  }
  return createInvitedProfile({
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    slug: baseSlug,
    role: "office_director",
    extra: {
      location_id: parsed.data.locationId,
      department: parsed.data.department,
      language: parsed.data.language,
      monthly_goal: parsed.data.monthlyGoal,
      commission_rate: parsed.data.commissionRate,
      commission_cap: parsed.data.commissionCap,
    },
    nextPath: "/dashboard",
    revalidate: ["/directores"],
  });
}

export async function resendDirectorAccess(id: string): Promise<
  | { ok: true; link: string; email: string }
  | { ok: false; error: string }
> {
  if (!id) return { ok: false, error: "Id inválido." };
  const guard = await assertCanManageDirectors();
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

// ──────────────────────────────────────────────────────────────────────────
// Edición + archivo / restauración / eliminación
// Mismo patrón que los comerciales (archive = soft delete, delete = hard).
// ──────────────────────────────────────────────────────────────────────────

const updateDirectorSchema = z
  .object({
    id: z.string().uuid(),
    fullName: z.string().min(2, "Nombre demasiado corto.").max(120),
    phone: z
      .string()
      .max(40)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    locationId: z.string().uuid("Selecciona una ficha."),
    department: departmentSchema,
    language: z
      .string()
      .max(60)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    monthlyGoal: z.coerce.number().int().min(0).max(1000),
    commissionRate: commissionRateSchema,
    commissionCap: commissionCapSchema,
    // 'archived' NO se gestiona aquí — solo desde archiveDirector/restoreDirector.
    status: z.enum(["invited", "active", "paused"]),
  })
  .refine(
    (v) => (v.department === "internacional" ? !!v.language : !v.language),
    {
      message: "Selecciona el idioma del director internacional.",
      path: ["language"],
    },
  );

export type UpdateDirectorInput = z.input<typeof updateDirectorSchema>;

/**
 * Edita los datos básicos de un director: nombre, teléfono, ficha asignada
 * y estado (invited/active/paused). NO permite cambiar el rol ni el email
 * (el email cambiarlo implica también tocar auth.users, no procede desde
 * un edit form normal). Service-client bypasea RLS.
 */
export async function updateDirector(input: UpdateDirectorInput) {
  const guard = await assertCanManageDirectors();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const parsed = updateDirectorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName.trim(),
      phone: parsed.data.phone,
      location_id: parsed.data.locationId,
      department: parsed.data.department,
      language: parsed.data.language,
      monthly_goal: parsed.data.monthlyGoal,
      commission_rate: parsed.data.commissionRate,
      commission_cap: parsed.data.commissionCap,
      status: parsed.data.status,
    } as never)
    .eq("id", parsed.data.id)
    .eq("role", "office_director");
  if (error) {
    console.error("[directores] updateDirector failed:", error);
    return { ok: false as const, error: error.message };
  }
  // Traza de la tarifa de comisión (campo que afecta a pagos). Los directores
  // solo los edita admin/reviews_manager.
  await recordAudit({
    entityType: "profile",
    entityId: parsed.data.id,
    action: "update_commission_rate",
    payload: {
      commission_rate: parsed.data.commissionRate,
      commission_cap: parsed.data.commissionCap,
    },
  });
  revalidatePath("/directores");
  revalidatePath(`/directores/${parsed.data.id}`);
  return { ok: true as const };
}

/**
 * Archiva un director (soft delete). NO borra la fila ni el auth.user;
 * marca status='archived', libera el slug original (sufijo `-archived-...`),
 * anonimiza email. Los sales con `director_id = X` mantienen la atribución
 * histórica de reseñas para el parte Excel.
 *
 * Si el director tiene comerciales activos asignados, los advertimos: la
 * decisión de reasignarlos o dejarlos sin director es del admin (no lo
 * hacemos automático para no perder el contexto). Esta función solo
 * archiva — el detalle del director muestra el equipo afectado.
 */
export async function archiveDirector(id: string) {
  if (!id) return { error: "Id inválido." };
  const guard = await assertCanManageDirectors();
  if (!guard.ok) return { error: guard.error };

  const admin = createServiceClient();
  const { data: target } = await admin
    .from("profiles")
    .select("slug, status")
    .eq("id", id)
    .eq("role", "office_director")
    .maybeSingle<{ slug: string; status: string }>();
  if (!target) return { error: "Director no encontrado." };
  if (target.status === "archived") return { ok: true }; // idempotente

  const archivedSlug = `${target.slug}-archived-${id.slice(0, 8)}`;
  const { error } = await admin
    .from("profiles")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      email: null,
      slug: archivedSlug,
      // Un archivado no debe seguir capturando visitas por su enlace viejo
      // (alias de mig 027) — se limpia junto con el slug.
      previous_slug: null,
    } as never)
    .eq("id", id)
    .eq("role", "office_director");

  if (error) {
    console.error("[directores] archiveDirector failed:", error);
    return { error: error.message };
  }

  revalidatePath("/directores");
  revalidatePath(`/directores/${target.slug}`);
  revalidatePath(`/directores/${archivedSlug}`);
  return { ok: true };
}

/**
 * Restaura un director archivado. Vuelve a status='invited' (para que el
 * admin pueda reenviar acceso) e intenta recuperar el slug original; si
 * está ocupado, mantiene el sufijo `-archived-...`.
 */
export async function restoreDirector(id: string) {
  if (!id) return { error: "Id inválido." };
  const guard = await assertCanManageDirectors();
  if (!guard.ok) return { error: guard.error };

  const admin = createServiceClient();
  const { data: target } = await admin
    .from("profiles")
    .select("slug, status")
    .eq("id", id)
    .eq("role", "office_director")
    .maybeSingle<{ slug: string; status: string }>();
  if (!target) return { error: "Director no encontrado." };
  if (target.status !== "archived") return { ok: true };

  // Colisión contra slug actual Y alias antiguos (previous_slug, mig 027).
  const originalSlug = target.slug.replace(/-archived-[a-f0-9]{8}$/, "");
  let finalSlug = target.slug;
  if (originalSlug !== target.slug) {
    const { data: collision } = await admin
      .from("profiles")
      .select("id")
      .or(`slug.eq.${originalSlug},previous_slug.eq.${originalSlug}`)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (!collision) finalSlug = originalSlug;
  }

  const { error } = await admin
    .from("profiles")
    .update({
      status: "invited",
      archived_at: null,
      slug: finalSlug,
    } as never)
    .eq("id", id)
    .eq("role", "office_director");

  if (error) {
    console.error("[directores] restoreDirector failed:", error);
    return { error: error.message };
  }

  revalidatePath("/directores");
  revalidatePath(`/directores/${target.slug}`);
  revalidatePath(`/directores/${finalSlug}`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Avatar del director (gestionado SOLO por admin / reviews_manager — el rol
// office_director no puede tocar la foto de otro director). Service-client +
// role-guard 'office_director'. `id` se bindea con .bind(null, id).
// ──────────────────────────────────────────────────────────────────────────

export async function uploadDirectorAvatar(
  id: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Id inválido." };
  const guard = await assertCanManageDirectors();
  if (!guard.ok) return guard;

  const stored = await storeUserAvatar(id, formData.get("file"));
  if (!stored.ok) return stored;

  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: stored.url } as never)
    .eq("id", id)
    .eq("role", "office_director");
  if (error) {
    console.error("[directores] uploadDirectorAvatar failed:", error);
    return { ok: false, error: error.message };
  }

  await recordAudit({ entityType: "profile", entityId: id, action: "update_avatar" });
  revalidatePath("/directores");
  revalidatePath(`/directores/${id}`);
  return { ok: true, url: stored.url };
}

export async function removeDirectorAvatar(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Id inválido." };
  const guard = await assertCanManageDirectors();
  if (!guard.ok) return guard;

  await removeUserAvatarObjects(id);

  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: null } as never)
    .eq("id", id)
    .eq("role", "office_director");
  if (error) {
    console.error("[directores] removeDirectorAvatar failed:", error);
    return { ok: false, error: error.message };
  }

  await recordAudit({ entityType: "profile", entityId: id, action: "remove_avatar" });
  revalidatePath("/directores");
  revalidatePath(`/directores/${id}`);
  return { ok: true };
}

/**
 * Elimina un office_director: borra el profile + el auth.user. En cascada:
 * los sales que tenían `director_id = este` quedan con director_id = NULL
 * (ON DELETE SET NULL en la FK). Vuelven al pool del admin/reviews_manager.
 */
export async function deleteOfficeDirector(id: string) {
  if (!id) return { error: "Id inválido." };
  const guard = await assertCanManageDirectors();
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
