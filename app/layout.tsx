import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReseñaHub — Gestión interna de reseñas",
  description:
    "Plataforma interna del Grupo Marina d'Or para gestionar reseñas de Google Business Profile por comercial.",
  // App interna: prohibimos indexación a cualquier buscador (defensa en
  // profundidad junto con app/robots.ts).
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
