import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exchangeCodeForTokens, getUserInfo } from "@/lib/google/business-profile";

const STATE_COOKIE = "google_oauth_state";

/**
 * Callback de OAuth con Google. Es público (Google llega aquí), pero la
 * legitimidad se valida vía cookie state que se setea en /api/google/oauth/start.
 *
 * Pasos:
 *  1. Compara `state` query param con la cookie. Si no coinciden, aborta.
 *  2. Extrae `location_id` del state.
 *  3. Intercambia el `code` por tokens.
 *  4. Persiste tokens en location_secrets + email en locations.
 *  5. Redirige a /fichas/<id>/conectar para que el admin elija la ficha de
 *     Google a vincular (selección de Business Profile location).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const fichasUrl = new URL("/fichas", url.origin);

  if (errorParam) {
    // Usuario denegó el consent o algo falló del lado de Google.
    fichasUrl.searchParams.set("oauth_error", errorParam);
    return clearCookieAndRedirect(fichasUrl);
  }

  if (!code || !state) {
    fichasUrl.searchParams.set("oauth_error", "missing_params");
    return clearCookieAndRedirect(fichasUrl);
  }

  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookieState || cookieState !== state) {
    fichasUrl.searchParams.set("oauth_error", "state_mismatch");
    return clearCookieAndRedirect(fichasUrl);
  }

  const [, locationId] = state.split(".");
  if (!locationId || !/^[0-9a-f-]{36}$/i.test(locationId)) {
    fichasUrl.searchParams.set("oauth_error", "bad_state");
    return clearCookieAndRedirect(fichasUrl);
  }

  // Defensa en profundidad: no confiar SOLO en la cookie state (que setea
  // /start). Reconfirmamos que quien completa el flujo sigue autenticado y con
  // permiso sobre esta location, por si el gate de /start regresara o la cookie
  // se reutilizara tras revocar permisos. admin → cualquier ficha;
  // office_director → solo la suya.
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    fichasUrl.searchParams.set("oauth_error", "not_authenticated");
    return clearCookieAndRedirect(fichasUrl);
  }
  const { data: prof } = await authClient
    .from("profiles")
    .select("role, location_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string; location_id: string | null }>();
  const allowed =
    prof?.role === "admin" ||
    (prof?.role === "office_director" && prof.location_id === locationId);
  if (!allowed) {
    fichasUrl.searchParams.set("oauth_error", "forbidden");
    return clearCookieAndRedirect(fichasUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Sin refresh_token no podemos sincronizar después. Google solo lo
      // devuelve si access_type=offline + prompt=consent (lo cual ya
      // forzamos en start). Si aún así no llega, el flow está mal.
      throw new Error("Google no devolvió refresh_token");
    }

    const userInfo = await getUserInfo(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const admin = createServiceClient();
    // Upsert en location_secrets — sin RLS porque es service-role only.
    const { error: secretsErr } = await admin
      .from("location_secrets")
      .upsert(
        {
          location_id: locationId,
          oauth_refresh_token: tokens.refresh_token,
          oauth_access_token: tokens.access_token,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "location_id" },
      );
    if (secretsErr) throw new Error(`upsert location_secrets: ${secretsErr.message}`);

    // Guardamos el email en locations para que el admin vea con qué cuenta
    // se ha autenticado, pero NO marcamos oauth_status='connected' todavía —
    // eso pasa cuando el admin elige la ficha de Google a vincular.
    const { error: locErr } = await admin
      .from("locations")
      .update({
        google_account_email: userInfo.email,
        oauth_last_sync_error: null,
      } as never)
      .eq("id", locationId);
    if (locErr) throw new Error(`update locations: ${locErr.message}`);

    const next = new URL(`/fichas/${locationId}/conectar`, url.origin);
    return clearCookieAndRedirect(next);
  } catch (err) {
    console.error("[google/oauth/callback] failed:", err);
    fichasUrl.searchParams.set("oauth_error", "exchange_failed");
    return clearCookieAndRedirect(fichasUrl);
  }
}

function clearCookieAndRedirect(target: URL) {
  const res = NextResponse.redirect(target);
  res.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
