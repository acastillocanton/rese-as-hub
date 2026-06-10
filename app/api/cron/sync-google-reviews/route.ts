import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncBusinessProfile } from "@/lib/google/sync-business-profile";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron entry point. Configurar el schedule en vercel.json:
 *   { "crons": [{ "path": "/api/cron/sync-google-reviews", "schedule": "5 5 * * *" }] }
 * (+ GitHub Action horaria `sync-reviews-hourly.yml`, ver §4.50).
 *
 * Protegido por shared secret (CRON_SECRET) que Vercel/GitHub mandan en el
 * header Authorization. Localmente:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" \
 *     http://localhost:3000/api/cron/sync-google-reviews
 *
 * Toda la orquestación (paginación, matcher, insert, notificaciones, alertas,
 * sync de respuestas del propietario) vive en `syncBusinessProfile()`
 * (lib/google/sync-business-profile.ts), compartida con el sync manual
 * `/api/sync/now`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || !auth || !secretMatches(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncBusinessProfile();
  return NextResponse.json({ ok: true, ...result });
}

function secretMatches(authHeader: string, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}
