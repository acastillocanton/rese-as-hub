import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * "Buzón" para la cosecha de deep-links de reseña (§4.54, vía B). El servidor
 * NO puede cosechar (necesita un Chrome real — ver §4.54), así que este
 * endpoint solo DEJA UNA PETICIÓN: inserta un audit `action='harvest_requested'`.
 * El agente del PC de oficina (agent/harvest-maps-urls.mjs --watch) sondea ese
 * audit cada ~60s y, si hay una petición nueva, hace la cosecha y escribe los
 * deep-links en la BD compartida → todos los gestores ven el resultado.
 *
 *   POST /api/sync/maps-urls   (sin body)
 *
 * Solo admin + reviews_manager. Devuelve cuántas reseñas están pendientes de
 * deep-link (para el feedback del botón). Si el PC está apagado, la petición
 * queda registrada y se procesa cuando se encienda (el agente recupera backlog).
 */

// Centinela: el evento es global (no una entidad concreta). audit_log.entity_id
// es uuid sin FK, así que un uuid de ceros es válido y no colisiona.
const SENTINEL = "00000000-0000-0000-0000-000000000000";

export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 403 });
  if (profile.role !== "admin" && profile.role !== "reviews_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Cuántas reseñas siguen sin deep-link (para el mensaje del botón).
  const { count: pending } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .is("google_maps_url", null)
    .is("removed_at", null);

  await recordAudit({
    entityType: "location",
    entityId: SENTINEL,
    action: "harvest_requested",
    payload: { by: user.id, role: profile.role },
  });

  return NextResponse.json({ ok: true, pending: pending ?? 0 });
}
