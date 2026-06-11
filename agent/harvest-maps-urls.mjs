#!/usr/bin/env node
/**
 * AGENTE de cosecha de deep-links de reseña (§4.54, vía B) — corre en el PC de
 * oficina con un Chrome REAL. Es la única forma de cosechar TODAS las reseñas:
 * Google solo renderiza el módulo de reseñas a un navegador de verdad (no a un
 * servidor headless ni a un Chrome lanzado por el launcher de automation —
 * verificado). Este agente lanza el Chrome instalado con --remote-debugging-port
 * (lanzamiento LIMPIO, sin flags de automation) y se conecta por CDP, que es lo
 * que sí pasa el filtro de Google.
 *
 * Qué hace en cada ejecución (idempotente, "catch-up"):
 *   1. Lee de Supabase las reseñas SIN deep-link (`google_maps_url IS NULL`,
 *      no eliminadas), agrupadas por ficha. Procesa TODO el backlog acumulado
 *      (da igual cuánto tiempo estuvo el PC apagado → no se pierde nada).
 *   2. Lanza/usa un Chrome dedicado (perfil propio, no toca tu navegación) y
 *      acepta el muro de cookies una vez (queda guardado en el perfil).
 *   3. Por ficha: abre la pestaña Reseñas, ordena "Más recientes", hace scroll,
 *      extrae {token, autor, rating, fecha} de cada tarjeta + el FID de la URL.
 *   4. Casa con nuestras filas (autor≥90 + rating + fecha, único 1↔1) y escribe
 *      el deep-link con el builder verificado. audit `review_maps_url_matched`.
 *
 * Espeja la lógica de lib/google/maps-ugc.ts y lib/google/maps-url-matching.ts
 * (canónicas; aquí inline porque es .mjs). NO requiere admin: usa Node + el
 * Chrome ya instalados y un perfil en la carpeta del usuario.
 *
 * Variables (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Opcionales: CHROME_PATH, CDP_PORT (9222), HARVEST_PROFILE_DIR, ENRICH_MAX_SCROLLS.
 * Ejecutar:  node agent/harvest-maps-urls.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

// ── env ──
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(1);
}
const PORT = process.env.CDP_PORT || "9222";
const MAX_SCROLLS = Number(process.env.ENRICH_MAX_SCROLLS || 18);
const PROFILE_DIR = process.env.HARVEST_PROFILE_DIR || path.resolve("agent/.chrome-profile");
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe") : null,
].filter(Boolean);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── builder (espejo de lib/google/maps-ugc.ts) ──
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
  } catch { return null; }
}
function buildMapsReviewUrl(token, fid) {
  if (!token) return null;
  const cid = cidFromFid(fid);
  if (!cid) return null;
  const inner = innerFromReviewToken(token);
  if (!inner) return null;
  return `https://www.google.com/maps/reviews/data=!4m8!14m7!1m6!2m5!1s${token}!2m1!1s0x0:0x${cid}!3m1!1s2@1:${inner}%7C%7C`;
}

// ── matcher (espejo de lib/google/maps-url-matching.ts) ──
const NAME_THRESHOLD = 90;
const DATE_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
function normTokens(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}
function nameMatches(stored, dom) {
  const a = normTokens(stored), b = normTokens(dom);
  if (!a.length || !b.length) return false;
  if (a.join(" ") === b.join(" ")) return true;
  const bset = new Set(b);
  if (a.every((t) => bset.has(t))) return true;
  const aset = new Set(a);
  return b.every((t) => aset.has(t));
}
function isAnon(n) {
  n = (n || "").trim().toLowerCase();
  return n === "" || n === "anónimo" || n === "anonimo" || n === "a google user" || n === "usuario de google" || n === "un usuario de google";
}
function parseRelMs(text, nowMs) {
  if (!text) return null;
  const m = /hace\s+(un|una|\d+)\s+(hora|d[ií]a|semana|mes|a[nñ]o)/i.exec(text);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  const u = m[2].toLowerCase(), day = 864e5;
  const mult = u.startsWith("hora") ? 36e5 : u.startsWith("d") ? day : u.startsWith("semana") ? 7 * day : u.startsWith("mes") ? 30 * day : 365 * day;
  return nowMs - n * mult;
}
function passes(p, u, nowMs) {
  if (p.rating !== u.rating) return false;
  const ms = parseRelMs(u.dateText, nowMs);
  if (ms != null) {
    const sms = new Date(p.google_created_at).getTime();
    if (Number.isFinite(sms) && Math.abs(sms - ms) > DATE_WINDOW_MS) return false;
  }
  return nameMatches(p.author_name, u.author);
}
/** Devuelve [{id, url}] solo para matches únicos 1↔1. */
function matchUnique(pending, dom, fid, nowMs) {
  const domCount = dom.map((u) => pending.filter((p) => !isAnon(p.author_name) && passes(p, u, nowMs)).length);
  const out = [];
  for (const p of pending) {
    if (isAnon(p.author_name)) continue;
    const cand = [];
    for (let i = 0; i < dom.length; i++) if (passes(p, dom[i], nowMs)) cand.push(i);
    if (cand.length !== 1 || domCount[cand[0]] > 1) continue;
    const url = buildMapsReviewUrl(dom[cand[0]].token, fid);
    if (url) out.push({ id: p.id, url });
  }
  return out;
}

// ── extracción del DOM (función real; se serializa y corre en el navegador) ──
function extractReviewsInPage() {
  const fidM = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(location.href);
  const fid = fidM ? fidM[1] : null;
  const seen = new Set();
  const out = [];
  for (const c of document.querySelectorAll("div[data-review-id][aria-label]")) {
    const token = c.getAttribute("data-review-id");
    const author = (c.getAttribute("aria-label") || "").trim();
    if (!token || !author || seen.has(token)) continue;
    const starEl = [...c.querySelectorAll("[aria-label]")].find((e) => /\d+\s*estrella/i.test(e.getAttribute("aria-label") || ""));
    const rating = starEl ? Number(/(\d+)\s*estrella/i.exec(starEl.getAttribute("aria-label"))[1]) : 0;
    const dateEl = [...c.querySelectorAll("span")].find((s) => /hace\s+(un|una|\d+)\s+(hora|d[ií]a|semana|mes|a[nñ]o)/i.test(s.textContent || ""));
    seen.add(token);
    out.push({ token, author, rating, dateText: dateEl ? dateEl.textContent.trim() : null });
  }
  return { fid, reviews: out };
}

async function cdpReady() {
  try {
    const r = await fetch(`http://localhost:${PORT}/json/version`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

async function ensureChrome() {
  if (await cdpReady()) { log("Chrome ya escuchando en", PORT); return null; }
  const chromePath = CHROME_CANDIDATES.find((p) => p && existsSync(p));
  if (!chromePath) throw new Error("No encuentro chrome.exe. Define CHROME_PATH en .env.local.");
  log("Lanzando Chrome:", chromePath);
  const child = spawn(chromePath, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,900",
    "about:blank",
  ], { detached: true, stdio: "ignore" });
  child.unref();
  for (let i = 0; i < 30; i++) { if (await cdpReady()) { log("Chrome listo."); return child; } await sleep(1000); }
  throw new Error("Chrome no abrió el puerto de depuración a tiempo.");
}

/** Cierra el Chrome que lanzó el agente (identificado por su puerto de
 *  depuración). El perfil persiste en disco → el consentimiento no se pierde.
 *  Best-effort: si falla, Chrome queda abierto pero no es fatal. Windows-only. */
function killSpawnedChrome() {
  try {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${PORT}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { stdio: "ignore", timeout: 15000 });
    log("Chrome del agente cerrado.");
  } catch { /* best-effort */ }
}

async function handleConsent(page) {
  if (!/consent\.google\.com/.test(page.url())) return;
  log("Muro de cookies → aceptando (queda guardado en el perfil)…");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button, [role="button"], input[type="submit"]')]
      .find((b) => /aceptar todo|accept all|acepto/i.test((b.textContent || b.value || "")));
    if (btn) btn.click();
  });
  await sleep(3500);
}

async function harvestFicha(page, placeId) {
  await page.goto(`https://www.google.com/maps/place/?q=place_id:${placeId}&hl=es&gl=ES`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await sleep(2500);
  await handleConsent(page);
  if (/consent\.google\.com/.test(page.url())) {
    await page.goto(`https://www.google.com/maps/place/?q=place_id:${placeId}&hl=es&gl=ES`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(2500);
  }
  // abrir pestaña Reseñas
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button[role="tab"]')].find((b) => /Rese[ñn]as de/i.test(b.getAttribute("aria-label") || ""));
    if (tab) tab.click();
  });
  await sleep(3000);
  // ordenar por más recientes
  await page.evaluate(() => {
    const sortBtn = [...document.querySelectorAll("button")].find((b) => /ordenar rese/i.test((b.getAttribute("aria-label") || "") + " " + (b.textContent || "")));
    if (sortBtn) sortBtn.click();
  });
  await sleep(1300);
  await page.evaluate(() => {
    const rec = [...document.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')].find((e) => /m[aá]s recientes/i.test(e.textContent || ""));
    if (rec) rec.click();
  });
  await sleep(2500);
  // scroll
  let last = 0;
  for (let i = 0; i < MAX_SCROLLS; i++) {
    await page.evaluate(() => {
      let el = document.querySelector('div[data-review-id]');
      while (el && el !== document.body) { if (el.scrollHeight > el.clientHeight + 200 && el.clientHeight > 200) break; el = el.parentElement; }
      if (el) el.scrollTop = el.scrollHeight;
    });
    await sleep(1100);
    const n = await page.evaluate(() => document.querySelectorAll("div[data-review-id]").length);
    if (n === last && i > 2) break;
    last = n;
  }
  return page.evaluate(extractReviewsInPage);
}

async function main() {
  const nowMs = Date.now();
  const { data: pending, error } = await sb
    .from("reviews")
    .select("id, author_name, rating, google_created_at, location_id, location:locations(id, google_place_id)")
    .is("google_maps_url", null)
    .is("removed_at", null)
    .limit(5000);
  if (error) { console.error("query pending falló:", error.message); process.exit(1); }
  if (!pending || pending.length === 0) { log("Nada pendiente. Fin."); return; }

  const byLoc = new Map();
  for (const r of pending) {
    const loc = r.location;
    if (!loc || !loc.google_place_id) continue;
    if (!byLoc.has(loc.id)) byLoc.set(loc.id, { placeId: loc.google_place_id, rows: [] });
    byLoc.get(loc.id).rows.push(r);
  }
  log(`Pendientes: ${pending.length} reseñas en ${byLoc.size} fichas.`);

  const launchedChild = await ensureChrome();
  const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
  const ctx = browser.contexts()[0] || (await browser.newContext());
  const page = ctx.pages()[0] || (await ctx.newPage());

  let totalMatched = 0;
  for (const [locationId, { placeId, rows }] of byLoc) {
    try {
      const { fid, reviews } = await harvestFicha(page, placeId);
      if (!fid) { log(`[${locationId}] sin FID, skip`); continue; }
      const matches = matchUnique(rows, reviews, fid, nowMs);
      let n = 0;
      for (const m of matches) {
        const { count } = await sb.from("reviews")
          .update({ google_maps_url: m.url, maps_url_matched_at: new Date().toISOString() }, { count: "exact" })
          .eq("id", m.id).is("google_maps_url", null);
        if (count) n++;
      }
      if (n > 0) {
        await sb.from("audit_log").insert({ entity_type: "location", entity_id: locationId, action: "review_maps_url_matched", payload: { source: "maps_dom_harvest", matched: n, harvested: reviews.length, pending: rows.length } });
      }
      totalMatched += n;
      log(`[${locationId}] cosechadas:${reviews.length} casadas:${n}/${rows.length}`);
    } catch (e) {
      console.error(`[${locationId}] error:`, (e && e.message) || e);
    }
  }
  await browser.close().catch(() => {});
  // Si lo lanzamos nosotros, lo cerramos (el perfil en disco conserva el consent).
  if (launchedChild) killSpawnedChrome();
  log(`Total deep-links nuevos: ${totalMatched}.`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
