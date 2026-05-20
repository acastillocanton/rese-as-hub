"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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
