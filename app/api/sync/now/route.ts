import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncPlaces } from "@/lib/google/sync-places";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Sincronización manual de reseñas vía Places API, disparada por un usuario
 * autenticado (no por Vercel Cron).
 *
 *   POST /api/sync/now
 *     body opcional: { location_id?: string }
 *
 * Reglas por rol:
 *   - admin / reviews_manager: sin body → todas las fichas con place_id.
 *                              con location_id → solo esa.
 *   - office_director: ignora body; sincroniza únicamente su `profiles.location_id`
 *            (la ficha de su oficina).
 *   - sales: ignora body; sincroniza únicamente su `profiles.location_id`
 *            (la ficha que tiene asignada).
 *   - resto: 403.
 *
 * El lock optimista de 60s ya está dentro de `syncPlaces()` por location,
 * así que dos clicks rápidos seguidos devuelven `skipped_concurrent_run`
 * para las afectadas — no hay flooding posible.
 */

type Payload = { location_id?: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, location_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string; location_id: string | null }>();
  if (!profile) {
    return NextResponse.json({ error: "no_profile" }, { status: 403 });
  }

  let body: Payload = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as Payload;
  } catch {
    // body vacío o no-JSON → equivalente a sin filtro
  }

  let locationIds: string[] | null = null;

  if (profile.role === "admin" || profile.role === "reviews_manager") {
    if (typeof body.location_id === "string" && body.location_id.length > 0) {
      // Validar formato UUID (defensa en profundidad; paridad con
      // /api/export/sales/[id]). Evita propagar basura al filtro .in().
      if (!UUID_RE.test(body.location_id)) {
        return NextResponse.json({ error: "invalid_location_id" }, { status: 400 });
      }
      locationIds = [body.location_id];
    } // si no, todas
  } else if (profile.role === "office_director" || profile.role === "sales") {
    if (!profile.location_id) {
      return NextResponse.json(
        { error: "user_without_location" },
        { status: 400 },
      );
    }
    locationIds = [profile.location_id];
  } else {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await syncPlaces({ locationIds });
  return NextResponse.json({ ok: true, ...result });
}
