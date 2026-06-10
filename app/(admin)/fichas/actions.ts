"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Role } from "@/lib/supabase/types";

type ActorScope = { role: Role; locationId: string | null };

/**
 * Determina rol y location del actor. Para office_director devuelve su
 * location_id; para admin devuelve null (sin scope). Otros roles → no autorizado.
 */
async function assertCanManageLocations(): Promise<
  { ok: true; actor: ActorScope } | { ok: false; error: string }
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
  if (!data || (data.role !== "admin" && data.role !== "office_director")) {
    return { ok: false, error: "No autorizado." };
  }
  return { ok: true, actor: { role: data.role, locationId: data.location_id } };
}

/** Comprueba que `locationId` está en el scope del actor. */
function inLocationScope(actor: ActorScope, locationId: string): boolean {
  if (actor.role === "admin") return true;
  return actor.role === "office_director" && actor.locationId === locationId;
}

const createSchema = z.object({
  name: z.string().min(2, "Nombre demasiado corto.").max(120, "Demasiado largo."),
  googlePlaceId: z
    .string()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  brand: z.enum(["inseryal", "marina_dor_construcciones"]),
});

export type CreateLocationInput = z.infer<typeof createSchema>;

export async function createLocation(input: CreateLocationInput) {
  // Crear fichas nuevas es solo-admin (no procede para office_director).
  const auth = await assertCanManageLocations();
  if (!auth.ok) return { error: auth.error };
  if (auth.actor.role !== "admin") {
    return { error: "Solo el admin general puede crear fichas." };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const payload = {
    name: parsed.data.name.trim(),
    google_place_id: parsed.data.googlePlaceId,
    brand: parsed.data.brand,
  };
  const { error } = await supabase.from("locations").insert(payload as never);
  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe una ficha con ese Google Place ID." };
    }
    console.error("[fichas] createLocation failed:", error);
    return { error: "No se pudo crear la ficha." };
  }
  revalidatePath("/fichas");
  return { ok: true };
}

const linkSchema = z.object({
  locationId: z.string().uuid(),
  googleAccountId: z.string().min(1), // "accounts/123"
  // El picker envía el `name` de la ficha tal cual lo da la Business
  // Information API: "locations/456" (relativo a la cuenta). La API v4 de
  // reseñas (mybusiness.googleapis.com/v4/.../reviews) exige el recurso
  // COMPLETO "accounts/123/locations/456" → lo componemos abajo. Ver §4.26.
  googleLocationResource: z.string().min(1), // "locations/456" o ya completo
  googlePlaceId: z.string().optional().nullable(),
});

/**
 * Vincula una ficha de nuestra DB con una ficha concreta de Google Business
 * Profile. Persiste los IDs en `locations` y marca oauth_status='connected'.
 * Tras esto, el cron de sync ya puede pedir reseñas para esta ficha.
 */
export async function linkGoogleLocation(input: z.input<typeof linkSchema>) {
  const auth = await assertCanManageLocations();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!inLocationScope(auth.actor, parsed.data.locationId)) {
    return { ok: false as const, error: "Solo puedes conectar la ficha de tu oficina." };
  }
  // Usamos service client para garantizar que el upsert pasa sin cuestiones
  // de RLS (este action solo se llama desde la página /fichas/[id]/conectar,
  // que ya es admin-only por middleware).
  // Componemos el resource COMPLETO que exige la API v4 de reseñas:
  // "accounts/123/locations/456". Si ya viene completo (empieza por
  // "accounts/"), lo dejamos tal cual; si viene relativo ("locations/456"),
  // le anteponemos la cuenta. Sin esto, v4/locations/456/reviews → 404.
  const fullResource = parsed.data.googleLocationResource.startsWith("accounts/")
    ? parsed.data.googleLocationResource
    : `${parsed.data.googleAccountId}/${parsed.data.googleLocationResource}`;

  const admin = createServiceClient();
  const update: Record<string, unknown> = {
    google_account_id: parsed.data.googleAccountId,
    google_location_resource: fullResource,
    oauth_status: "connected",
    oauth_last_sync_error: null,
  };
  if (parsed.data.googlePlaceId) {
    update.google_place_id = parsed.data.googlePlaceId;
  }
  const { error } = await admin
    .from("locations")
    .update(update as never)
    .eq("id", parsed.data.locationId);
  if (error) {
    console.error("[fichas] linkGoogleLocation failed:", error);
    return { ok: false as const, error: error.message };
  }
  revalidatePath("/fichas");
  return { ok: true as const };
}

/**
 * Desconecta Google de una ficha: borra tokens, vacía resource y baja
 * oauth_status a 'disconnected'. El cron deja de pedir reseñas para ella.
 */
export async function disconnectGoogleLocation(locationId: string) {
  if (!locationId) return { error: "Id inválido." };
  const auth = await assertCanManageLocations();
  if (!auth.ok) return { error: auth.error };
  if (!inLocationScope(auth.actor, locationId)) {
    return { error: "Solo puedes desconectar la ficha de tu oficina." };
  }
  const admin = createServiceClient();
  // Tokens fuera. Si falla aquí abortamos: dejar la location en
  // disconnected con un refresh_token vivo en location_secrets sería un
  // estado inconsistente (el cron no la procesaría pero el secreto
  // seguiría en BD).
  const { error: secretsErr } = await admin
    .from("location_secrets")
    .delete()
    .eq("location_id", locationId);
  if (secretsErr) {
    console.error(
      "[fichas] disconnectGoogleLocation failed deleting secrets:",
      secretsErr,
    );
    return { error: `No se pudieron borrar los tokens: ${secretsErr.message}` };
  }
  // Estado a disconnected y campos OAuth a null.
  const { error } = await admin
    .from("locations")
    .update({
      google_account_id: null,
      google_location_resource: null,
      google_account_email: null,
      oauth_status: "disconnected",
      oauth_last_sync_at: null,
      oauth_last_sync_error: null,
    } as never)
    .eq("id", locationId);
  if (error) {
    console.error("[fichas] disconnectGoogleLocation failed:", error);
    return { error: error.message };
  }
  revalidatePath("/fichas");
  return { ok: true };
}

const placeIdSchema = z.object({
  locationId: z.string().uuid("Id inválido."),
  googlePlaceId: z
    .string()
    .max(250)
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
    .refine(
      (v) => v === null || /^[A-Za-z0-9_\-]{10,250}$/.test(v),
      "Place ID inválido. Debe tener 10-250 caracteres alfanuméricos, '_' o '-'.",
    ),
});

/**
 * Permite al admin editar el `google_place_id` de una ficha después de
 * crearla. Útil para fichas creadas antes de que la cuota oficial de
 * Business Profile estuviera disponible: el Place ID se rellena a mano y
 * habilita el cron de Places API (que solo necesita esto, no OAuth).
 */
export async function updateLocationPlaceId(input: z.input<typeof placeIdSchema>) {
  const auth = await assertCanManageLocations();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  const parsed = placeIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!inLocationScope(auth.actor, parsed.data.locationId)) {
    return { ok: false as const, error: "Solo puedes editar la ficha de tu oficina." };
  }
  // Service client: /fichas es admin-only por middleware, pero el unique
  // constraint sobre google_place_id puede chocar con RLS de update. Mejor
  // bypasear y dejar que la unique decida.
  const admin = createServiceClient();
  const { error } = await admin
    .from("locations")
    .update({ google_place_id: parsed.data.googlePlaceId } as never)
    .eq("id", parsed.data.locationId);
  if (error) {
    if (error.code === "23505") {
      return { ok: false as const, error: "Ya existe otra ficha con ese Place ID." };
    }
    console.error("[fichas] updateLocationPlaceId failed:", error);
    return { ok: false as const, error: error.message };
  }
  revalidatePath("/fichas");
  return { ok: true as const };
}

const brandSchema = z.object({
  locationId: z.string().uuid(),
  brand: z.enum(["inseryal", "marina_dor_construcciones"]),
});

/**
 * Cambia la marca de una ficha. Solo admin: la marca determina qué etiquetas,
 * logo y plantillas ven los usuarios asignados a esa ficha — es decisión
 * organizacional, no operativa, así que el office_director NO puede tocarla
 * de su propia oficina.
 */
export async function updateLocationBrand(input: z.input<typeof brandSchema>) {
  const auth = await assertCanManageLocations();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  if (auth.actor.role !== "admin") {
    return { ok: false as const, error: "Solo el admin general puede cambiar la marca de una ficha." };
  }
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const admin = createServiceClient();
  const { error } = await admin
    .from("locations")
    .update({ brand: parsed.data.brand } as never)
    .eq("id", parsed.data.locationId);
  if (error) {
    console.error("[fichas] updateLocationBrand failed:", error);
    return { ok: false as const, error: error.message };
  }
  revalidatePath("/fichas");
  return { ok: true as const };
}

export async function deleteLocation(id: string) {
  if (!id || typeof id !== "string") {
    return { error: "Id inválido." };
  }
  // Eliminar fichas: solo admin global (un director no borra su propia oficina).
  const auth = await assertCanManageLocations();
  if (!auth.ok) return { error: auth.error };
  if (auth.actor.role !== "admin") {
    return { error: "Solo el admin general puede eliminar fichas." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) {
    console.error("[fichas] deleteLocation failed:", error);
    return { error: "No se pudo eliminar." };
  }
  revalidatePath("/fichas");
  return { ok: true };
}

const ratingSchema = z.object({
  locationId: z.string().uuid(),
  averageRating: z.coerce
    .number()
    .min(1, "Mínimo 1,0.")
    .max(5, "Máximo 5,0.")
    .refine((n) => Math.round(n * 10) / 10 === n, "Solo un decimal."),
  totalReviewCount: z.coerce.number().int().min(0, "No puede ser negativo."),
});

export type UpdateLocationRatingInput = z.input<typeof ratingSchema>;

/**
 * Actualiza el rating cacheado de una ficha. Mientras la cuota de la Google
 * Business Profile API está a 0 (caso 5-5855000041022), este es el único
 * camino para alimentar la cabecera del parte Excel. Cuando Google apruebe,
 * el cron sobrescribirá estos valores marcando rating_source='google_api'.
 */
export async function updateLocationRating(input: UpdateLocationRatingInput) {
  const auth = await assertCanManageLocations();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  const parsed = ratingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!inLocationScope(auth.actor, parsed.data.locationId)) {
    return { ok: false as const, error: "Solo puedes editar el rating de tu oficina." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("locations")
    .update({
      average_rating: parsed.data.averageRating,
      total_review_count: parsed.data.totalReviewCount,
      rating_source: "manual",
      rating_updated_at: new Date().toISOString(),
    } as never)
    .eq("id", parsed.data.locationId);
  if (error) {
    console.error("[fichas] updateLocationRating failed:", error);
    return { ok: false as const, error: error.message };
  }
  revalidatePath("/fichas");
  revalidatePath(`/fichas/${parsed.data.locationId}`);
  return { ok: true as const };
}
