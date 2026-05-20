import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

/**
 * Vercel Cron entry point. Configure schedule in vercel.json:
 *   { "crons": [{ "path": "/api/cron/sync-google-reviews", "schedule": "*\/10 * * * *" }] }
 *
 * Protected by a shared secret (CRON_SECRET) sent as Authorization header by
 * the Vercel scheduler. Locally you can call it with the matching header.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || !auth || !secretMatches(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // TODO: implement actual sync against Google Business Profile API:
  //   1. List connected locations from Supabase.
  //   2. For each, call accounts.locations.reviews.list (paginated).
  //   3. Upsert new reviews, run attribute_review() for each.
  //   4. Notify sales via Resend on successful matches.
  return NextResponse.json({ ok: true, todo: "implement sync" });
}

function secretMatches(authHeader: string, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  // Length must match exactly for timingSafeEqual; reject early otherwise
  // (the length itself isn't sensitive — the secret is fixed).
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}
