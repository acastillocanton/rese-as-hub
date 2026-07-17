import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncBusinessProfile } from "@/lib/google/sync-business-profile";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Sincronización manual de reseñas vía Google Business Profile, disparada por
 * un usuario autenticado (no por Vercel Cron). BP es la fuente única desde
 * 2026-06-10 (§4.50) — Places API apagado, así que este endpoint usa el mismo
 * orquestador que el cron (`syncBusinessProfile`).
 *
 *   POST /api/sync/now
 *     body opcional: { location_id?: string }
 *
 * Reglas por rol:
 *   - admin / reviews_manager: sin body → todas las fichas conectadas.
 *                              con location_id → solo esa.
 *   - office_director: ignora body; sincroniza únicamente su `profiles.location_id`
 *            (la ficha de su oficina).
 *   - sales: ignora body; sincroniza únicamente su `profiles.location_id`
 *            (la ficha que tiene asignada).
 *   - sales cross_location (escrituradora, §4.60): sin ficha fija →
 *            sincroniza las fichas de sus clientes (clients.location_id), o
 *            todas las escrituracion_target si aún no tiene clientes.
 *   - resto: 403.
 *
 * El lock optimista de 60s ya está dentro de `syncBusinessProfile()` por
 * location, así que dos clicks rápidos seguidos devuelven `skipped_concurrent_run`
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
    .select("role, location_id, cross_location")
    .eq("id", user.id)
    .maybeSingle<{
      role: string;
      location_id: string | null;
      cross_location: boolean | null;
    }>();
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
    if (profile.cross_location) {
      // Comercial multi-oficina ("escrituradora", §4.60): no tiene ficha fija.
      // Sus reseñas aterrizan en las fichas de sus clientes (clients.location_id).
      // Sincronizamos esas fichas; si aún no tiene clientes, caemos a todas las
      // fichas destino de escrituración (escrituracion_target).
      const { data: clientRows } = await supabase
        .from("clients")
        .select("location_id")
        .eq("sales_id", user.id)
        .not("location_id", "is", null);
      const fromClients = Array.from(
        new Set(
          (clientRows ?? [])
            .map((r) => (r as { location_id: string | null }).location_id)
            .filter((id): id is string => typeof id === "string"),
        ),
      );
      if (fromClients.length > 0) {
        locationIds = fromClients;
      } else {
        const { data: targets } = await supabase
          .from("locations")
          .select("id")
          .eq("escrituracion_target", true);
        locationIds = (targets ?? []).map((r) => (r as { id: string }).id);
      }
    } else {
      if (!profile.location_id) {
        return NextResponse.json(
          { error: "user_without_location" },
          { status: 400 },
        );
      }
      locationIds = [profile.location_id];
    }
  } else {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await syncBusinessProfile({ locationIds });
  return NextResponse.json({ ok: true, ...result });
}
