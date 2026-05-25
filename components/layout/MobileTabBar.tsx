"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  type LucideIcon,
  LayoutDashboard,
  Link2,
  ListChecks,
  MapPin,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import { pickActiveId } from "./active-item";

export type MobileTab = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Tabs de la versión mobile del rol `sales`. "Clientes" no está aquí
 * intencionalmente: se accede desde el Panel (card "Mis clientes" mobile-only)
 * o por URL directa, manteniendo la tab bar alineada con el mockup
 * (_design_package/ReseñaHub/screens/mobile.jsx).
 */
export const SALES_MOBILE_TABS: MobileTab[] = [
  { id: "panel", label: "Panel", href: "/panel", icon: LayoutDashboard },
  { id: "link", label: "Enlace", href: "/panel/enlace", icon: Link2 },
  { id: "reviews", label: "Reseñas", href: "/panel/resenas", icon: Star },
  { id: "ranking", label: "Ranking", href: "/panel/ranking", icon: Trophy },
];

/**
 * Tabs del rol `office_director` en mobile (migración 011). Las 4 destinos
 * principales del director, espejando OFFICE_DIRECTOR_SIDEBAR_GROUPS minus
 * el export Excel (poco frecuente y accesible desde el "más" implícito).
 */
export const DIRECTOR_MOBILE_TABS: MobileTab[] = [
  { id: "dashboard", label: "Inicio", href: "/dashboard", icon: LayoutDashboard },
  { id: "sales", label: "Comerciales", href: "/comerciales", icon: Users },
  { id: "verification", label: "Reseñas", href: "/resenas/verificacion", icon: ListChecks },
  { id: "branch", label: "Mi ficha", href: "/fichas", icon: MapPin },
];

/**
 * Tab bar fija inferior — solo se ve en mobile (viewport ≤767px) gracias al
 * wrapper `.m-hide-desktop` que el layout correspondiente pone alrededor.
 * El array de tabs se pasa por prop para que cada rol consuma los suyos.
 */
export function MobileTabBar({ tabs }: { tabs: MobileTab[] }) {
  const pathname = usePathname() ?? "";
  const activeId = useMemo(() => pickActiveId(tabs, pathname), [tabs, pathname]);

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
      {tabs.map((t) => {
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
