#!/usr/bin/env node
/**
 * Enriquecimiento de deep-links de reseña (§4.54) — runner headless.
 *
 * Rellena `reviews.google_maps_url` con el enlace directo a cada reseña en
 * Google Maps. Ninguna API oficial de Google da esa URL (ver §4.54), así que:
 *   1. Resolvemos el Feature ID (FID) de cada ficha desde su página de Maps
 *      (cacheado en `locations.google_fid`).
 *   2. Con Playwright headless abrimos el panel de reseñas y leemos, de cada
 *      reseña renderizada, su `data-review-id` (el token del botón "Compartir"),
 *      autor, estrellas y fecha relativa — SIN clicar "Compartir" ni tocar
 *      ningún endpoint interno.
 *   3. Casamos esas reseñas con nuestras filas pendientes por autor + rating
 *      (+ fecha como guarda laxa), solo cuando el match es ÚNICO en ambos
 *      sentidos (conservador: preferimos no-URL → la UI cae a la lista, que
 *      perder al usuario en una reseña ajena).
 *   4. Construimos la URL (determinista, desde data-review-id + CID) y la
 *      escribimos donde `google_maps_url IS NULL` (race-safe, idempotente).
 *
 * ⚠️⚠️ LIMITACIÓN CONOCIDA — NO funciona con un navegador AUTOMATIZADO (spike
 * 2026-06-11): probado con Playwright headless, headed, `channel:"chrome"`,
 * con/sin flujo de consentimiento y con anti-automation flags — Google Maps
 * sirve a los navegadores controlados por Playwright una versión REDUCIDA de
 * la ficha (solo el resumen de valoraciones; SIN pestaña "Reseñas" ni tarjetas
 * `div[data-review-id]`). La extracción devuelve 0 reseñas. La IP de datacenter
 * NO está bloqueada (la página de ficha y el FID se resuelven bien) — el muro
 * es anti-automatización del módulo de reseñas, no la IP.
 *
 * Lo único que renderizó las reseñas fue un Chrome REAL con perfil de usuario
 * (la sesión de chrome-devtools del spike). Por eso este runner SOLO sirve
 * conectándose a un Chrome real ya abierto vía CDP (Playwright connectOverCDP),
 * NO lanzando uno nuevo — y eso debe verificarse antes de programarlo. Hasta
 * entonces queda como herramienta MANUAL/experimental; el deep-link también se
 * puede poblar pegando a mano el enlace de "Compartir reseña" (ver §4.54).
 *
 * Lo que SÍ está probado y es robusto: la construcción de la URL desde
 * data-review-id + FID (lib/google/maps-ugc.ts, verificada E2E) y el match
 * (lib/google/maps-url-matching.ts). El cuello de botella es solo COSECHAR los
 * tokens del DOM de forma automatizada.
 *
 * Variables de entorno: NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL),
 * SUPABASE_SERVICE_ROLE_KEY, ENRICH_MAX_* (opcionales). NO va en scripts/
 * (gitignored): es un job versionado, aunque hoy no esté cableado a CI.
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_LOCATIONS = Number(process.env.ENRICH_MAX_LOCATIONS || 10);
const MAX_SCROLLS = Number(process.env.ENRICH_MAX_SCROLLS || 40);
const MAX_REVIEWS = Number(process.env.ENRICH_MAX_REVIEWS || 400);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CONSENT_COOKIES = [
  { name: "SOCS", value: "CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg", domain: ".google.com", path: "/" },
  { name: "CONSENT", value: "YES+cb.20210720-07-p0.en+FX+410", domain: ".google.com", path: "/" },
];

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── helpers puros (espejo compacto de lib/google/*; canónico + tests allí) ──

function cidFromFid(fid) {
  if (!fid) return null;
  const parts = String(fid).split(":");
  if (parts.length !== 2) return null;
  const cid = parts[1].replace(/^0x/, "");
  return /^[0-9a-f]+$/i.test(cid) ? cid : null;
}

function innerFromReviewToken(token) {
  try {
    const b = Buffer.from(token, "base64");
    if (b.length < 3 || b[0] !== 0x0a) return null;
    const len = b[1];
    if (b.length < 2 + len) return null;
    return b.subarray(2, 2 + len).toString("latin1");
  } catch {
    return null;
  }
}

function buildMapsReviewUrl(token, fid) {
  if (!token) return null;
  const cid = cidFromFid(fid);
  if (!cid) return null;
  const inner = innerFromReviewToken(token);
  if (!inner) return null;
  return (
    "https://www.google.com/maps/reviews/data=" +
    `!4m8!14m7!1m6!2m5!1s${token}` +
    `!2m1!1s0x0:0x${cid}` +
    `!3m1!1s2@1:${inner}%7C%7C`
  );
}

function normName(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Identidad ≥90 (espejo de nameSimilarity): exacto, o todos los tokens del
 *  almacenado contenidos en el autor del DOM. */
function nameMatches(stored, dom) {
  const a = normName(stored);
  const b = normName(dom);
  if (a.length === 0 || b.length === 0) return false;
  if (a.join(" ") === b.join(" ")) return true;
  const bset = new Set(b);
  return a.every((t) => bset.has(t));
}

function parseRelativeDateMs(text, nowMs) {
  if (!text) return null;
  const m = /hace\s+(un|una|\d+)\s+(hora|d[ií]a|semana|mes|a[nñ]o)/i.exec(text);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  const unit = m[2].toLowerCase();
  const day = 24 * 3600 * 1000;
  const mult = unit.startsWith("hora") ? 3600 * 1000
    : unit.startsWith("d") ? day
    : unit.startsWith("semana") ? 7 * day
    : unit.startsWith("mes") ? 30 * day
    : 365 * day; // año
  return nowMs - n * mult;
}

const DATE_WINDOW_MS = 31 * 24 * 3600 * 1000;

function dateOk(p, d) {
  if (d.createdAtMs == null) return true;
  const ms = new Date(p.google_created_at).getTime();
  if (!Number.isFinite(ms)) return false;
  return Math.abs(ms - d.createdAtMs) <= DATE_WINDOW_MS;
}

/** Match conservador 1↔1 único (espejo de matchUgcToReviews). */
function matchUnique(pending, dom) {
  const domCount = dom.map((d) =>
    pending.filter((p) => p.rating === d.rating && nameMatches(p.author_name, d.author) && dateOk(p, d)).length,
  );
  const result = [];
  for (const p of pending) {
    const cand = [];
    for (let i = 0; i < dom.length; i++) {
      const d = dom[i];
      if (p.rating === d.rating && nameMatches(p.author_name, d.author) && dateOk(p, d)) cand.push(i);
    }
    if (cand.length !== 1) continue; // 0 o ambiguo → skip
    if (domCount[cand[0]] > 1) continue; // ese dom casa con varias filas → skip
    const url = buildMapsReviewUrl(dom[cand[0]].token, p._fid);
    if (url) result.push({ id: p.id, url });
  }
  return result;
}

// ── extracción del DOM (corre dentro del navegador) ──
const EXTRACT_FN = () => {
  const seen = new Set();
  const out = [];
  const containers = document.querySelectorAll("div[data-review-id]");
  for (const el of containers) {
    const token = el.getAttribute("data-review-id");
    if (!token || seen.has(token)) continue;
    const starEl = el.querySelector('[aria-label*="estrella"]');
    if (!starEl) continue; // no es una tarjeta de reseña
    const shareBtn = el.querySelector('button[data-review-id][aria-label*="Compartir"]');
    const aria = (shareBtn && shareBtn.getAttribute("aria-label")) || "";
    const author = aria.replace(/^Compartir rese[ñn]a de\s*/i, "").replace(/\.\s*$/, "").trim();
    if (!author) continue;
    const starM = /(\d+)\s*estrella/i.exec(starEl.getAttribute("aria-label") || "");
    const rating = starM ? Number(starM[1]) : 0;
    const dateEl = [...el.querySelectorAll("span")].find((s) =>
      /hace\s+(un|una|\d+)\s+(hora|d|semana|mes|a)/i.test(s.textContent || ""),
    );
    const dateText = (dateEl && dateEl.textContent && dateEl.textContent.trim()) || null;
    seen.add(token);
    out.push({ token, author, rating, dateText });
  }
  return out;
};

async function resolveFid(page, placeId) {
  await page.goto(`https://www.google.com/maps/place/?q=place_id:${placeId}&hl=es&gl=ES`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const html = await page.content();
  const matches = html.match(/0x[0-9a-f]{6,}:0x[0-9a-f]{6,}/g);
  if (!matches) return null;
  const counts = new Map();
  for (const m of matches) counts.set(m, (counts.get(m) || 0) + 1);
  let best = null, bestN = 0;
  for (const [fid, n] of counts) if (n > bestN) { best = fid; bestN = n; }
  return best;
}

async function extractReviews(page, placeId) {
  await page.goto(`https://www.google.com/maps/place/?q=place_id:${placeId}&hl=es&gl=ES`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  // Abrir pestaña Reseñas si existe.
  try {
    const tab = page.locator('button[role="tab"][aria-label*="Reseñas"], button[aria-label*="Reseñas de"]').first();
    if (await tab.count()) await tab.click({ timeout: 5000 });
  } catch {}
  await page.waitForTimeout(2500);
  // Scroll incremental dentro del feed para cargar más reseñas.
  let prev = 0;
  for (let i = 0; i < MAX_SCROLLS; i++) {
    const reviews = await page.evaluate(EXTRACT_FN);
    if (reviews.length >= MAX_REVIEWS) return reviews;
    if (reviews.length === prev && i > 2) return reviews; // no crece → fin
    prev = reviews.length;
    await page.evaluate(() => {
      const nodes = document.querySelectorAll("div[data-review-id]");
      const last = nodes[nodes.length - 1];
      if (last) last.scrollIntoView({ block: "end" });
      const feed = document.querySelector('div[tabindex="-1"][aria-label]') ||
        [...document.querySelectorAll("div")].find((d) => d.scrollHeight > d.clientHeight + 400);
      if (feed) feed.scrollTop = feed.scrollHeight;
    });
    await page.waitForTimeout(1200);
  }
  return page.evaluate(EXTRACT_FN);
}

async function main() {
  const nowMs = Date.now();
  const { data: pending, error } = await sb
    .from("reviews")
    .select("id, author_name, rating, google_created_at, location_id, location:locations(id, google_place_id, google_fid)")
    .is("google_maps_url", null)
    .is("removed_at", null)
    .limit(2000);
  if (error) { console.error("query pending failed:", error.message); process.exit(1); }
  if (!pending || pending.length === 0) { console.log("Nada pendiente. Fin."); return; }

  const byLoc = new Map();
  for (const r of pending) {
    const loc = r.location;
    if (!loc || !loc.google_place_id) continue;
    if (!byLoc.has(loc.id)) byLoc.set(loc.id, { loc, rows: [] });
    byLoc.get(loc.id).rows.push(r);
  }
  const locs = [...byLoc.values()].slice(0, MAX_LOCATIONS);
  console.log(`Pendientes: ${pending.length} reseñas en ${byLoc.size} fichas (proceso ${locs.length}).`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale: "es-ES" });
  await ctx.addCookies(CONSENT_COOKIES);
  const page = await ctx.newPage();

  let totalMatched = 0;
  for (const { loc, rows } of locs) {
    try {
      let fid = loc.google_fid;
      if (!fid) {
        fid = await resolveFid(page, loc.google_place_id);
        if (fid) {
          await sb.from("locations").update({ google_fid: fid }).eq("id", loc.id);
          console.log(`  [${loc.id}] FID resuelto: ${fid}`);
        }
      }
      if (!fid) { console.log(`  [${loc.id}] sin FID, skip`); continue; }

      const dom = (await extractReviews(page, loc.google_place_id)).map((d) => ({
        ...d,
        createdAtMs: parseRelativeDateMs(d.dateText, nowMs),
      }));
      console.log(`  [${loc.id}] reseñas leídas del DOM: ${dom.length}`);

      const withFid = rows.map((r) => ({ ...r, _fid: fid }));
      const matches = matchUnique(withFid, dom);

      let n = 0;
      for (const m of matches) {
        const { error: upErr, count } = await sb
          .from("reviews")
          .update({ google_maps_url: m.url, maps_url_matched_at: new Date().toISOString() }, { count: "exact" })
          .eq("id", m.id)
          .is("google_maps_url", null); // race-safe
        if (!upErr && count) n++;
      }
      if (n > 0) {
        await sb.from("audit_log").insert({
          entity_type: "location",
          entity_id: loc.id,
          action: "review_maps_url_matched",
          payload: { matched: n, dom_reviews: dom.length, pending: rows.length },
        });
      }
      totalMatched += n;
      console.log(`  [${loc.id}] casadas y escritas: ${n}/${rows.length}`);
    } catch (e) {
      console.error(`  [${loc.id}] error:`, (e && e.message) || e);
    }
  }

  await browser.close();
  console.log(`Total reseñas con deep-link nuevo: ${totalMatched}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
