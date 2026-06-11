#!/usr/bin/env node
/**
 * Enriquecimiento OFICIAL de deep-links de reseña (§4.54, Capa 1) — sin
 * navegador, sin scraping.
 *
 * Places API (New) devuelve, por cada reseña DESTACADA (~5/ficha, las que
 * Google elige), un campo `googleMapsUri` que ES el enlace directo a esa
 * reseña concreta en Google Maps. Lo usamos para poblar `reviews.google_maps_url`
 * de las reseñas más visibles, de forma robusta y repetible (cron-friendly).
 *
 * Limitación de origen: solo ~5/ficha (la API New no pagina). El resto del
 * histórico no se cubre por esta vía — para esas, pegado manual (§4.54 Capa 3).
 * El spike de derivación offline desde el reviewId de Business Profile quedó
 * REFUTADO (§4.54: el reviewId es opaco/cifrado, sin el post-id de Maps), así
 * que esta es la única cosecha automática y sin fricción disponible.
 *
 * Casamos cada reseña destacada con nuestras filas por autor (identidad ≥90) +
 * rating + fecha (aquí ABSOLUTA y precisa, vía publishTime → guarda estricta).
 * Solo escribimos en match ÚNICO 1↔1 (conservador: preferimos no-URL → la UI
 * cae a la lista, que enlazar a la reseña equivocada). Espeja la lógica de
 * lib/google/maps-url-matching.ts (canónica + tests allí).
 *
 * Idempotente y race-safe: UPDATE … WHERE google_maps_url IS NULL.
 *
 * Variables: NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 * GOOGLE_PLACES_API_KEY. Carga .env.local si existe. Ejecutar:
 *   node jobs/enrich-review-urls-official.mjs
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── cargar .env.local (Windows-friendly, sin dotenv) ──
try {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
} catch { /* sin .env.local */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!PLACES_KEY) {
  console.error("Falta GOOGLE_PLACES_API_KEY — necesaria para Places API (New). Añádela a .env.local (ver §4.18).");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── matcher (espejo compacto de lib/google/maps-url-matching.ts) ──
const NAME_IDENTITY_THRESHOLD = 90;
// Places New da fecha ABSOLUTA y precisa → guarda estricta (±2 días absorbe
// husos/redondeos sin arriesgar). Mucho más fino que los 31 días del DOM.
const DATE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

function normTokens(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
/** Identidad ≥90: exacto, o todos los tokens del almacenado contenidos en el
 *  autor de Places (o viceversa). Conservador. */
function nameMatches(stored, other) {
  const a = normTokens(stored);
  const b = normTokens(other);
  if (a.length === 0 || b.length === 0) return false;
  if (a.join(" ") === b.join(" ")) return true;
  const bset = new Set(b);
  if (a.every((t) => bset.has(t))) return true;
  const aset = new Set(a);
  return b.every((t) => aset.has(t));
}
function isAnonymous(name) {
  const n = (name || "").trim().toLowerCase();
  return n === "" || n === "anónimo" || n === "anonimo" || n === "a google user" || n === "usuario de google" || n === "un usuario de google";
}
function passesBar(stored, ugc) {
  if (stored.rating !== ugc.rating) return false;
  if (ugc.createdAtMs != null) {
    const ms = new Date(stored.google_created_at).getTime();
    if (!Number.isFinite(ms)) return false;
    if (Math.abs(ms - ugc.createdAtMs) > DATE_WINDOW_MS) return false;
  }
  return nameMatches(stored.author_name, ugc.author);
}
/** Match conservador único 1↔1. Devuelve [{ id, url }]. */
function matchUnique(pending, ugc) {
  const ugcCount = ugc.map((u) => pending.filter((p) => !isAnonymous(p.author_name) && passesBar(p, u)).length);
  const out = [];
  for (const p of pending) {
    if (isAnonymous(p.author_name)) continue;
    const cand = [];
    for (let i = 0; i < ugc.length; i++) if (passesBar(p, ugc[i])) cand.push(i);
    if (cand.length !== 1) continue;
    if (ugcCount[cand[0]] > 1) continue; // ese ugc casa con varias filas → ambiguo
    out.push({ id: p.id, url: ugc[cand[0]].url });
  }
  return out;
}

async function fetchPlaceNewReviews(placeId) {
  const fieldMask = [
    "reviews.rating",
    "reviews.authorAttribution",
    "reviews.publishTime",
    "reviews.googleMapsUri",
  ].join(",");
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=es`;
  const res = await fetch(url, {
    headers: { "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": fieldMask },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Places New HTTP ${res.status}: ${body?.error?.message ?? "?"}`);
  }
  const out = [];
  for (const r of body.reviews ?? []) {
    const mapsUri = r.googleMapsUri?.trim();
    if (!mapsUri) continue;
    const rating = Math.round(r.rating ?? 0);
    if (rating < 1 || rating > 5) continue;
    const author = r.authorAttribution?.displayName?.trim() ?? "";
    let createdAtMs = null;
    if (r.publishTime) {
      const ms = new Date(r.publishTime).getTime();
      if (Number.isFinite(ms)) createdAtMs = ms;
    }
    out.push({ url: mapsUri, author, rating, createdAtMs });
  }
  return out;
}

async function main() {
  const { data: pending, error } = await sb
    .from("reviews")
    .select("id, author_name, rating, google_created_at, location_id, location:locations(id, google_place_id)")
    .is("google_maps_url", null)
    .is("removed_at", null)
    .limit(5000);
  if (error) { console.error("query pending failed:", error.message); process.exit(1); }
  if (!pending || pending.length === 0) { console.log("Nada pendiente. Fin."); return; }

  const byLoc = new Map();
  for (const r of pending) {
    const loc = r.location;
    if (!loc || !loc.google_place_id) continue;
    if (!byLoc.has(loc.id)) byLoc.set(loc.id, { loc, rows: [] });
    byLoc.get(loc.id).rows.push(r);
  }
  console.log(`Pendientes: ${pending.length} reseñas en ${byLoc.size} fichas.`);

  let totalMatched = 0;
  let totalFeatured = 0;
  for (const { loc, rows } of byLoc.values()) {
    try {
      const ugc = await fetchPlaceNewReviews(loc.google_place_id);
      totalFeatured += ugc.length;
      const matches = matchUnique(rows, ugc);
      let n = 0;
      for (const m of matches) {
        const { count } = await sb
          .from("reviews")
          .update({ google_maps_url: m.url, maps_url_matched_at: new Date().toISOString() }, { count: "exact" })
          .eq("id", m.id)
          .is("google_maps_url", null);
        if (count) n++;
      }
      if (n > 0) {
        await sb.from("audit_log").insert({
          entity_type: "location",
          entity_id: loc.id,
          action: "review_maps_url_matched",
          payload: { source: "places_new_official", matched: n, featured: ugc.length, pending: rows.length },
        });
      }
      totalMatched += n;
      console.log(`  [${loc.id}] destacadas:${ugc.length} casadas:${n}/${rows.length}`);
    } catch (e) {
      console.error(`  [${loc.id}] error:`, (e && e.message) || e);
    }
  }
  console.log(`\nTotal: ${totalMatched} deep-links nuevos (de ${totalFeatured} destacadas leídas).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
