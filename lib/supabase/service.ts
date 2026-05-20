import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Service-role Supabase client — bypasses RLS. Use ONLY in server code that
 * (a) handles unauthenticated public traffic (e.g. the /c landing route), or
 * (b) runs in a trusted background context (cron, webhooks).
 *
 * Never import this from a client component, a middleware, or any code path
 * that touches the response body returned to the user — the key is sensitive.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase service role not configured (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing).",
    );
  }
  return createSupabaseClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
