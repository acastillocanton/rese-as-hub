import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isValidSlug } from "@/lib/url-validation";
import type { ShareSource } from "@/lib/supabase/types";
import { randomBytes } from "node:crypto";

const ALLOWED_SOURCES: ShareSource[] = ["whatsapp", "email", "sms", "qr", "direct"];

function parseSource(raw: string | null): ShareSource {
  if (!raw) return "direct";
  const v = raw.toLowerCase();
  return (ALLOWED_SOURCES as string[]).includes(v) ? (v as ShareSource) : "direct";
}

function buildGoogleReviewUrl(placeId: string | null): string {
  if (!placeId) {
    return "https://www.google.com/maps";
  }
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

type LandingResult = {
  redirectTo: string;
  recorded: boolean;
};

export async function recordOpenAndRedirect(opts: {
  salesSlug: string;
  clientSlug?: string;
  source: string | null;
  userAgent: string | null;
}): Promise<LandingResult> {
  if (!isSupabaseConfigured()) {
    return { redirectTo: buildGoogleReviewUrl(null), recorded: false };
  }

  // Defense-in-depth: even though Next route params are typed, the value
  // is attacker-controlled. Reject anything that doesn't look like a slug.
  if (!isValidSlug(opts.salesSlug)) {
    return { redirectTo: buildGoogleReviewUrl(null), recorded: false };
  }
  if (opts.clientSlug !== undefined && !isValidSlug(opts.clientSlug)) {
    return { redirectTo: buildGoogleReviewUrl(null), recorded: false };
  }

  // The visitor is anonymous (no Supabase session) so we use the service-role
  // client which bypasses RLS. This route never returns user-controlled data
  // to the client; it only performs an INSERT and then a 302 redirect.
  const supabase = createServiceClient();
  const source = parseSource(opts.source);

  // Productor = sales OR office_director. Los directores también venden y
  // tienen su enlace /c/{director-slug} (dualidad gestor + comercial). La
  // tabla share_links y reviews son agnósticas al role, así que `sales_id`
  // del director funciona idéntico que para un comercial.
  let { data: sales } = await supabase
    .from("profiles")
    .select("id, location_id")
    .eq("slug", opts.salesSlug)
    .in("role", ["sales", "office_director"])
    .maybeSingle<{ id: string; location_id: string | null }>();

  // Alias de slug antiguo (mig 027): los productores renombrados a
  // "nombre + primer apellido" (2026-06-11) guardan su slug viejo en
  // previous_slug. Los QRs impresos y los WhatsApps ya enviados con el
  // enlace viejo siguen redirigiendo Y atribuyendo al mismo comercial.
  if (!sales) {
    const fallback = await supabase
      .from("profiles")
      .select("id, location_id")
      .eq("previous_slug", opts.salesSlug)
      .in("role", ["sales", "office_director"])
      .maybeSingle<{ id: string; location_id: string | null }>();
    sales = fallback.data;
  }

  if (!sales || !sales.location_id) {
    return { redirectTo: buildGoogleReviewUrl(null), recorded: false };
  }

  const { data: loc } = await supabase
    .from("locations")
    .select("google_place_id")
    .eq("id", sales.location_id)
    .maybeSingle<{ google_place_id: string | null }>();

  let clientId: string | null = null;
  if (opts.clientSlug) {
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("sales_id", sales.id)
      .eq("slug", opts.clientSlug)
      .maybeSingle<{ id: string }>();
    clientId = client?.id ?? null;
  }

  const truncatedUA = truncate(opts.userAgent, 512);

  // Dedupe defensivo: si el mismo navegador (user_agent) del mismo
  // cliente abrió este enlace en los últimos 5 minutos, NO insertamos
  // otra fila. Casos típicos:
  //   • Usuario abre Google, vuelve atrás y re-click.
  //   • Previews/prefetch del navegador en móvil que disparan dos GETs.
  //   • Comercial probando su propio enlace varias veces seguidas.
  // El segundo GET sigue redirigiendo normal — el usuario no nota nada.
  // Solo evitamos inflar KPIs y la lista "Visitas recientes" del
  // dashboard. Solo aplicamos si hay client_id Y user_agent (las visitas
  // anónimas o sin UA fingerprintable se cuentan tal cual).
  if (clientId && truncatedUA) {
    const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: recent } = await supabase
      .from("share_links")
      .select("id")
      .eq("sales_id", sales.id)
      .eq("client_id", clientId)
      .eq("user_agent", truncatedUA)
      .gte("opened_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) {
      return {
        redirectTo: buildGoogleReviewUrl(loc?.google_place_id ?? null),
        recorded: false,
      };
    }
  }

  const linkToken = randomBytes(8).toString("hex");
  const payload = {
    sales_id: sales.id,
    client_id: clientId,
    location_id: sales.location_id,
    link_token: linkToken,
    source,
    user_agent: truncatedUA,
  };
  // NOTE: cast until we regenerate types with `supabase gen types typescript`.
  await supabase.from("share_links").insert(payload as never);

  return {
    redirectTo: buildGoogleReviewUrl(loc?.google_place_id ?? null),
    recorded: true,
  };
}
