import type { NextConfig } from "next";

// Content-Security-Policy permisivo pero efectivo. Lo que se permite:
//  - default-src 'self': nada de terceros por defecto.
//  - img-src https: + data: + blob: para avatares de Storage público
//    (resenas.marinadorconstrucciones.com/storage/...), QR generados in-line,
//    placeholders, etc.
//  - script-src con 'unsafe-inline' + 'unsafe-eval': Next.js 15 necesita
//    ambos en producción para hidratación de Server Components y RSC payload.
//    No se puede apretar más sin migrar a nonce-based (Next no lo soporta
//    aún para todo el árbol). Aceptable porque no aceptamos input HTML.
//  - style-src 'unsafe-inline': la app usa style={{...}} extensivamente.
//  - connect-src: Supabase (REST + Realtime WS), Google APIs (mybusiness*).
//  - frame-ancestors 'none' equivale a X-Frame-Options: DENY moderno.
//  - form-action 'self' impide secuestros de form submit.
const CSP = [
  "default-src 'self'",
  "img-src 'self' https: data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.googleapis.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fija el workspace root del proyecto. Sin esto, Next >=15.5 detecta el
  // package-lock.json huérfano del home del usuario y elige /Users/...
  // como root, lo que rompe tanto el dev server (Turbopack pide leer
  // ~/Documents y macOS responde permiso denegado de TCC) como el build
  // (Cannot find module for page: /_document). Apuntar a __dirname
  // restaura el comportamiento correcto en ambos modos.
  turbopack: {
    root: __dirname,
  },
  outputFileTracingRoot: __dirname,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
