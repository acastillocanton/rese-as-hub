import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncPlaces } from "@/lib/google/sync-places";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron contra Google Places API (Place Details legacy con
 * `reviews_sort=newest`). Devuelve las 5 reseñas más recientes de cada ficha
 * con `google_place_id` configurado.
 *
 * Schedule en vercel.json: `0 5 * * *` (06:00 hora invierno / 07:00 verano
 * España). Plus: GitHub Action externo cada hora (.github/workflows/sync-
 * places-hourly.yml) para reducir el riesgo de perder reseñas en fichas
 * activas (Places solo devuelve top-5 por llamada, sin paginación).
 *
 * Toda la lógica vive en `lib/google/sync-places.ts` para reutilizarla desde
 * el endpoint manual `/api/sync/now`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || !auth || !secretMatches(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncPlaces();
  return NextResponse.json({ ok: true, ...result });
}

function secretMatches(authHeader: string, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}
