import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { enrichReviewMapsUrls } from "@/lib/google/enrich-maps-urls";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron de enriquecimiento de deep-links de reseña (§4.54, Capa 1). Schedule en
 * vercel.json (diario). Llama a Places API (New) por ficha, casa las ~5
 * destacadas con nuestras filas sin deep-link y escribe `google_maps_url`.
 *
 * Protegido por CRON_SECRET (Bearer). Requiere GOOGLE_PLACES_API_KEY en el
 * entorno. Local:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" \
 *     http://localhost:3000/api/cron/enrich-review-urls
 *
 * Toda la orquestación vive en `enrichReviewMapsUrls()` (nunca lanza),
 * compartida con el job manual jobs/enrich-review-urls-official.mjs.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || !auth || !secretMatches(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await enrichReviewMapsUrls();
  return NextResponse.json({ ok: true, ...result });
}

function secretMatches(authHeader: string, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}
