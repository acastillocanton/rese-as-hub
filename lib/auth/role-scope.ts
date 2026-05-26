import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Role } from "@/lib/supabase/types";

// Aceptamos cualquier SupabaseClient<Database> independientemente de los
// generics extra que añaden las versiones recientes de @supabase/supabase-js
// y @supabase/ssr (signatures de 3 vs 4 type args). El segundo generic en
// realidad se ignora a nivel runtime; lo dejamos abierto.
type AnySupabaseClient = SupabaseClient<Database, any, any, any>;

export type RoleScope = {
  /** Rol del usuario actual. `null` si no hay sesión o no hay profile. */
  role: Role | null;
  /** UUID del usuario en auth.users. `null` si no hay sesión. */
  userId: string | null;
  /**
   * Para `office_director` y `sales`: la ficha (location) a la que está
   * asignado el usuario. Para admin/reviews_manager: `null` (sin scope).
   * Por contrato de BD (constraint role_requires_location de migración 011)
   * un office_director SIEMPRE tiene location_id; un sales también.
   */
  locationId: string | null;
};

/**
 * Lee de `profiles` el rol y el `location_id` del usuario autenticado actual.
 * Patrón de uso en server components:
 *
 *     const scope = await getRoleScope(supabase);
 *     if (scope.role === "office_director") {
 *       query = query.eq("location_id", scope.locationId!);
 *     }
 *
 * Devuelve `{ role: null, userId: null, locationId: null }` si no hay sesión
 * o el perfil no existe. Las páginas que ya gatean por middleware NO deberían
 * encontrar usuarios sin sesión aquí, pero el helper es defensivo.
 */
export async function getRoleScope(
  supabase: AnySupabaseClient,
): Promise<RoleScope> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { role: null, userId: null, locationId: null };

  const { data } = await supabase
    .from("profiles")
    .select("role, location_id")
    .eq("id", user.id)
    .maybeSingle<{ role: Role; location_id: string | null }>();

  return {
    role: data?.role ?? null,
    userId: user.id,
    locationId: data?.location_id ?? null,
  };
}
