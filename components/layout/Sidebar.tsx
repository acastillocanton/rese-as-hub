"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { Avatar } from "@/components/ui/Avatar";

export type SidebarItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
};

type SidebarProps = {
  items: SidebarItem[];
  user: { name: string; subtitle: string };
};

/**
 * Calcula qué item del sidebar está activo según la URL.
 *
 * Reglas:
 *  - Match exacto contra el path del href (ignorando hash) gana siempre.
 *  - Si no, prefix match (`/comerciales/comercial-prueba` activa "comerciales").
 *    Cuando hay varios candidatos por prefix, gana el más específico (href más
 *    largo).
 */
function pickActiveId(items: SidebarItem[], pathname: string): string | null {
  for (const item of items) {
    const itemPath = item.href.split("#")[0];
    if (pathname === itemPath) return item.id;
  }
  const sorted = [...items].sort(
    (a, b) => b.href.split("#")[0].length - a.href.split("#")[0].length,
  );
  for (const item of sorted) {
    const itemPath = item.href.split("#")[0];
    if (itemPath !== "/" && pathname.startsWith(itemPath + "/")) return item.id;
  }
  return null;
}

export function Sidebar({ items, user }: SidebarProps) {
  const pathname = usePathname() ?? "";
  const activeId = useMemo(() => pickActiveId(items, pathname), [items, pathname]);

  return (
    <aside
      style={{
        width: 232,
        flexShrink: 0,
        background: "var(--bg)",
        borderRight: "1px solid var(--line)",
        padding: "20px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "4px 8px",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            background: "#1D1D1F",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          r
        </div>
        <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.015em" }}>
          ReseñaHub
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((it) => {
          const on = it.id === activeId;
          return (
            <Link
              key={it.id}
              href={it.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 8,
                background: on ? "rgba(0,0,0,0.05)" : "transparent",
                color: on ? "var(--ink)" : "var(--ink-3)",
                fontSize: 13.5,
                fontWeight: on ? 600 : 500,
                textDecoration: "none",
              }}
              aria-current={on ? "page" : undefined}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 18,
                  textAlign: "center",
                  color: "var(--ink-4)",
                  fontSize: 13,
                }}
              >
                {it.icon}
              </span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 8px",
          borderTop: "1px solid var(--line)",
          paddingTop: 14,
        }}
      >
        <Avatar name={user.name} size={28} />
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{user.subtitle}</div>
        </div>
      </div>
    </aside>
  );
}

export const ADMIN_SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: "◧" },
  { id: "team", label: "Comerciales", href: "/comerciales", icon: "◔" },
  { id: "reviews", label: "Reseñas", href: "/resenas/verificacion", icon: "☆" },
  { id: "branches", label: "Fichas Google", href: "/fichas", icon: "⌂" },
  { id: "settings", label: "Ajustes", href: "/ajustes", icon: "◇" },
];

export const SALES_SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "panel", label: "Mi panel", href: "/panel", icon: "◧" },
  { id: "link", label: "Mi enlace", href: "/panel#enlace", icon: "⊕" },
  { id: "clients", label: "Mis clientes", href: "/clientes", icon: "◐" },
  { id: "reviews", label: "Mis reseñas", href: "/panel#resenas", icon: "★" },
];

export const MANAGER_SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "reviews", label: "Reseñas", href: "/manager/resenas", icon: "☆" },
  { id: "export", label: "Exportar Excel", href: "/manager/export", icon: "⤓" },
];
