import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOAuthStartUrl } from "@/lib/google/business-profile";

const STATE_COOKIE = "google_oauth_state";

/**
 * Inicia el flujo OAuth con Google. Accesible para admin global y para
 * office_director (este último solo sobre SU ficha). Genera un state CSRF
 * con nonce + location_id, lo guarda en cookie httpOnly, y redirige al
 * consent de Google.
 *
 * Uso:
 *   GET /api/google/oauth/start?location_id=<uuid>
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const locationId = url.searchParams.get("location_id");

  if (!locationId || !/^[0-9a-f-]{36}$/i.test(locationId)) {
    return new NextResponse("location_id requerido", { status: 400 });
  }

  // Defensa en profundidad: confirma rol y, para director, que la ficha
  // sea la suya (middleware ya gatea la ruta pero no inspecciona el param).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, location_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string; location_id: string | null }>();
  if (profile?.role !== "admin" && profile?.role !== "office_director") {
    return new NextResponse("forbidden", { status: 403 });
  }
  if (profile.role === "office_director" && profile.location_id !== locationId) {
    return new NextResponse("forbidden — fuera de tu oficina", { status: 403 });
  }

  // Confirma que la ficha existe (no necesario para la corrección, pero
  // evita iniciar el flow para una location inválida).
  const { data: loc } = await supabase
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .maybeSingle<{ id: string }>();
  if (!loc) return new NextResponse("ficha no encontrada", { status: 404 });

  // State CSRF: nonce + location_id. El nonce queda en una cookie httpOnly,
  // el callback compara contra ella.
  const nonce = randomBytes(24).toString("hex");
  const state = `${nonce}.${locationId}`;

  const consentUrl = getOAuthStartUrl(state);

  const response = NextResponse.redirect(consentUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // necesario porque Google redirige cross-site al callback
    path: "/",
    maxAge: 60 * 10, // 10 minutos
  });

  return response;
}
