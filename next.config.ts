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
  // Fija el workspace root para Turbopack. Sin esto, Turbopack >=15.5
  // detecta un package-lock.json huérfano en el home del usuario y elige
  // /Users/... como root, lo que en macOS dispara un permiso denegado
  // de TCC sobre ~/Documents y mata el dev server al arrancar.
  turbopack: {
    root: __dirname,
  },
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
