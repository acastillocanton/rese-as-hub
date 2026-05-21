import type { NextConfig } from "next";

const SECURITY_HEADERS = [
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
  // TODO: tighten CSP once we know the final font/script origins.
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
