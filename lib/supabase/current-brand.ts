import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_BRAND } from "@/lib/branding";
import type { Brand } from "@/lib/supabase/types";

/**
 * Devuelve la marca del usuario autenticado actual derivada de su
 * `profiles.location_id → locations.brand`. Si no tiene location (admin
 * general, reviews_manager sin oficina) o la BD no está accesible,
 * devuelve DEFAULT_BRAND ('inseryal').
 *
 * Usa cliente normal (no service-role): las policies actuales de `locations`
 * (`locations_admin_all`, `locations_select_others`, `locations_director_select`)
 * ya permiten al usuario leer al menos su propia location.
 */
export async function getCurrentUserBrand(): Promise<Brand> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_BRAND;

  const { data } = await supabase
    .from("profiles")
    .select("locations:locations(brand)")
    .eq("id", user.id)
    .maybeSingle<{ locations: { brand: Brand } | null }>();

  return data?.locations?.brand ?? DEFAULT_BRAND;
}
