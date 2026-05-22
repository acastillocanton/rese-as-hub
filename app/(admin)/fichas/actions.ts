"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const createSchema = z.object({
  name: z.string().min(2, "Nombre demasiado corto.").max(120, "Demasiado largo."),
  googlePlaceId: z
    .string()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
});

export type CreateLocationInput = z.infer<typeof createSchema>;

export async function createLocation(input: CreateLocationInput) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const payload = {
    name: parsed.data.name.trim(),
    google_place_id: parsed.data.googlePlaceId,
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
  googleLocationResource: z.string().min(1), // "accounts/123/locations/456"
  googlePlaceId: z.string().optional().nullable(),
});

/**
 * Vincula una ficha de nuestra DB con una ficha concreta de Google Business
 * Profile. Persiste los IDs en `locations` y marca oauth_status='connected'.
 * Tras esto, el cron de sync ya puede pedir reseñas para esta ficha.
 */
export async function linkGoogleLocation(input: z.input<typeof linkSchema>) {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  // Usamos service client para garantizar que el upsert pasa sin cuestiones
  // de RLS (este action solo se llama desde la página /fichas/[id]/conectar,
  // que ya es admin-only por middleware).
  const admin = createServiceClient();
  const update: Record<string, unknown> = {
    google_account_id: parsed.data.googleAccountId,
    google_location_resource: parsed.data.googleLocationResource,
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

export async function deleteLocation(id: string) {
  if (!id || typeof id !== "string") {
    return { error: "Id inválido." };
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
