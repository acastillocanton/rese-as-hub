import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database, Role } from "./types";
import { isSupabaseConfigured } from "./config";
import { isSafeNext } from "../url-validation";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const ROLE_HOME: Record<Role, string> = {
  admin: "/dashboard",
  sales: "/panel",
  reviews_manager: "/dashboard",
  office_director: "/dashboard",
};

// Bots, crawlers y link-previewers. Reciben 403 incluso en rutas públicas
// (login, /c/..., legales). Capa adicional sobre X-Robots-Tag — aquel evita
// que indexen, esto evita que hagan fetch siquiera.
//
// El check va ANTES de isPublicPath para que cubra TODA la app. Email
// scanners (Microsoft Safe Links, etc.) NO incluyen "bot" en su UA, así que
// el HEAD a /auth/confirm sigue funcionando (§4.9 del CLAUDE.md). Vercel
// Cron usa "vercel-cron/1.0" → tampoco matchea.
const BLOCKED_UA_KEYWORDS = [
  // Detectores genéricos
  "bot", "crawler", "spider", "scraper", "crawling",
  // Buscadores principales
  "googlebot", "bingbot", "baidu", "yandex", "duckduckgo",
  // Previewers sociales / mensajería
  "facebookexternalhit", "facebot", "twitterbot", "linkedinbot",
  "slackbot", "whatsapp", "telegrambot", "discordbot",
  // Apple
  "applebot",
  // LLM / AI crawlers
  "gptbot", "ccbot", "claudebot", "claude-web", "anthropic-ai",
  "perplexitybot", "chatgpt-user", "google-extended", "amazonbot",
  // SEO / scrapers misc.
  "bytespider", "petalbot", "ahrefsbot", "semrushbot",
  "mj12bot", "dotbot",
];

function isBlockedBot(ua: string | null): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return BLOCKED_UA_KEYWORDS.some((k) => lower.includes(k));
}

// Routes accessible without an authenticated session.
//  - /login            sign-in page
//  - /accept-invite    initial onboarding from emailed invite
//  - /c/               public landing for the client (redirects to Google)
//  - /auth/            magic-link callback + signout (anyone, by design)
//  - /api/cron/        cron endpoints (self-authenticated via CRON_SECRET)
//  - /api/google/oauth/callback  OAuth return from Google Business Profile
//  - /privacidad, /terminos  legal pages linked from OAuth consent
//  - /_next, /favicon  framework + static assets
const PUBLIC_PREFIXES = [
  "/login",
  "/accept-invite",
  "/c/",
  "/auth/",
  "/api/cron",
  "/api/google/oauth/callback",
  "/privacidad",
  "/terminos",
  "/_next",
  "/favicon",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

// Allowlist of route prefixes per role. Keep this explicit — do NOT use a
// blanket `/api` match because future API routes default to NO access.
// Exportado para test unit en lib/__tests__/route-access.test.ts.
export function pathAllowedForRole(pathname: string, role: Role): boolean {
  // /perfil y /ayuda son accesibles a todos los roles. Perfil para foto +
  // datos personales; ayuda para el manual de uso (sales, admin, manager).
  if (pathname === "/perfil" || pathname.startsWith("/perfil/")) return true;
  if (pathname === "/ayuda" || pathname.startsWith("/ayuda/")) return true;
  if (role === "admin") return true;
  if (role === "sales") {
    return (
      pathname.startsWith("/panel") ||
      pathname.startsWith("/clientes")
    );
  }
  if (role === "reviews_manager") {
    // El gestor comparte vistas con el admin (Dashboard + comerciales) y
    // tiene plenos permisos de administración sobre el rol `sales` (migración
    // 005): invitar, editar, reenviar acceso, eliminar. Lo que sigue siendo
    // solo-admin: /gestores, /fichas, /resenas/verificacion, /ajustes.
    // /manager/* aloja los listados read-only del propio gestor (lista global
    // de reseñas, exportar Excel).
    return (
      pathname === "/dashboard" ||
      pathname.startsWith("/comerciales") ||
      pathname.startsWith("/ranking") ||
      pathname.startsWith("/manager") ||
      pathname.startsWith("/api/export")
    );
  }
  if (role === "office_director") {
    // El director es DUAL: admin de su equipo + comercial productor (tiene
    // su propio /c/{slug}, clientes, reseñas atribuidas). Por eso accede
    // tanto a las rutas de admin como a las del panel sales (/panel,
    // /clientes). El scope sigue siendo:
    //   • Equipo (sales con director_id = él) → /comerciales, dashboard,
    //     verificación, export, ranking.
    //   • Su producción → /panel/*, /clientes/* (sales_id = él).
    //   • Su ficha → /fichas (por location_id, no por equipo).
    // NO accede a /gestores, /ajustes, /directores, /manager/resenas.
    return (
      pathname === "/dashboard" ||
      pathname.startsWith("/comerciales") ||
      pathname.startsWith("/ranking") ||
      pathname.startsWith("/fichas") ||
      pathname.startsWith("/resenas/verificacion") ||
      pathname.startsWith("/panel") ||
      pathname.startsWith("/clientes") ||
      pathname === "/manager/export" ||
      pathname.startsWith("/api/export") ||
      pathname.startsWith("/api/sync") ||
      pathname.startsWith("/api/google/oauth")
    );
  }
  return false;
}

export async function updateSession(request: NextRequest) {
  // Block bots/crawlers antes que cualquier otra cosa. Garantiza que ni
  // siquiera /login, /c/... o /privacidad les responda con HTML utilizable.
  if (isBlockedBot(request.headers.get("user-agent"))) {
    return new NextResponse("Forbidden", {
      status: 403,
      headers: {
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  let response = NextResponse.next({ request });

  // Demo mode: Supabase not yet connected. Let every request through so the
  // user can navigate the UI before configuring env vars.
  if (!isSupabaseConfigured()) {
    return response;
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    return response;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Only echo `next` back to the login page if it's safe; otherwise drop it.
    if (isSafeNext(pathname)) {
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: Role }>();

  const role = profile?.role ?? null;

  if (!role) {
    // Authenticated but no profile yet — send to invite acceptance.
    if (!pathname.startsWith("/accept-invite")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "no-profile");
      return NextResponse.redirect(url);
    }
    return response;
  }

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = ROLE_HOME[role];
    return NextResponse.redirect(url);
  }

  if (!pathAllowedForRole(pathname, role)) {
    const url = request.nextUrl.clone();
    url.pathname = ROLE_HOME[role];
    return NextResponse.redirect(url);
  }

  return response;
}
