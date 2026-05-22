"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  type LucideIcon,
  LayoutDashboard,
  Link2,
  Star,
  Trophy,
} from "lucide-react";
import { pickActiveId } from "./active-item";

type Tab = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

const TABS: Tab[] = [
  { id: "panel", label: "Panel", href: "/panel", icon: LayoutDashboard },
  { id: "link", label: "Enlace", href: "/panel/enlace", icon: Link2 },
  { id: "reviews", label: "Reseñas", href: "/panel/resenas", icon: Star },
  { id: "ranking", label: "Ranking", href: "/panel/ranking", icon: Trophy },
];

/**
 * Tab bar fija inferior — solo se ve en mobile (viewport ≤767px) gracias al
 * wrapper `.sales-hide-desktop` que el (sales)/layout pone alrededor.
 *
 * Los 4 items son los del rol comercial. "Clientes" intencionalmente no está
 * aquí: se accede desde el Panel (card "Mis clientes" mobile-only) o por URL
 * directa. Esto mantiene la tab bar visualmente alineada con el mockup
 * (_design_package/ReseñaHub/screens/mobile.jsx) sin perder funcionalidad real.
 */
export function MobileTabBar() {
  const pathname = usePathname() ?? "";
  const activeId = useMemo(() => pickActiveId(TABS, pathname), [pathname]);

  return (
    <nav
      aria-label="Navegación principal"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        background: "var(--surface)",
        borderTop: "1px solid var(--line)",
        paddingTop: 8,
        paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "stretch",
        boxShadow: "0 -1px 0 rgba(0, 0, 0, 0.02)",
      }}
    >
      {TABS.map((t) => {
        const on = t.id === activeId;
        const Icon = t.icon;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={on ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "6px 4px",
              color: on ? "var(--ink)" : "var(--ink-4)",
              fontWeight: on ? 600 : 500,
              textDecoration: "none",
              minHeight: 44,
            }}
          >
            <Icon
              aria-hidden="true"
              size={20}
              strokeWidth={on ? 2 : 1.75}
              style={{ color: on ? "var(--ink)" : "var(--ink-4)" }}
            />
            <span style={{ fontSize: 10.5, letterSpacing: "-0.005em" }}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
