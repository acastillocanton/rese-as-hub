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

  const { data: sales } = await supabase
    .from("profiles")
    .select("id, location_id")
    .eq("slug", opts.salesSlug)
    .eq("role", "sales")
    .maybeSingle<{ id: string; location_id: string | null }>();

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

  const linkToken = randomBytes(8).toString("hex");
  const payload = {
    sales_id: sales.id,
    client_id: clientId,
    location_id: sales.location_id,
    link_token: linkToken,
    source,
    user_agent: truncate(opts.userAgent, 512),
  };
  // NOTE: cast until we regenerate types with `supabase gen types typescript`.
  await supabase.from("share_links").insert(payload as never);

  return {
    redirectTo: buildGoogleReviewUrl(loc?.google_place_id ?? null),
    recorded: true,
  };
}
