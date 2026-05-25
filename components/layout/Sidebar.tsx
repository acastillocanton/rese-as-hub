"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  type LucideIcon,
  LayoutDashboard,
  Users,
  UserCog,
  Building2,
  MapPin,
  ListChecks,
  Star,
  Download,
  Link2,
  LifeBuoy,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { pickActiveId } from "./active-item";

export type SidebarItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export type SidebarGroup = {
  id: string;
  /** Si se omite, el grupo se renderiza sin header (útil para sidebars cortos). */
  label?: string;
  items: SidebarItem[];
};

type SidebarProps = {
  groups: SidebarGroup[];
  user: { name: string; subtitle: string; avatarUrl?: string | null };
};

export function Sidebar({ groups, user }: SidebarProps) {
  const pathname = usePathname() ?? "";
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const activeId = useMemo(() => pickActiveId(allItems, pathname), [allItems, pathname]);

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
        <img
          src="/brand/logo-cuadrado.png"
          alt=""
          aria-hidden="true"
          width={26}
          height={26}
          style={{ display: "block", borderRadius: 6 }}
        />
        <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.015em" }}>
          ReseñaHub
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {groups.map((group) => (
          <div key={group.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {group.label && (
              <div
                style={{
                  padding: "2px 12px 4px",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--ink-4)",
                  fontWeight: 600,
                }}
              >
                {group.label}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {group.items.map((it) => {
                const on = it.id === activeId;
                const Icon = it.icon;
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
                    <Icon
                      aria-hidden="true"
                      size={16}
                      strokeWidth={on ? 2 : 1.75}
                      style={{ color: on ? "var(--ink)" : "var(--ink-4)", flexShrink: 0 }}
                    />
                    <span>{it.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div
        style={{
          marginTop: "auto",
          padding: "8px 8px",
          borderTop: "1px solid var(--line)",
          paddingTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {/* Centro de ayuda — accesible a los tres roles. Pintado justo
            encima del avatar de perfil para que esté visible siempre sin
            ocupar espacio de la navegación principal. */}
        <Link
          href="/ayuda"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 10px",
            borderRadius: 8,
            background: pathname.startsWith("/ayuda") ? "rgba(0,0,0,0.05)" : "transparent",
            color: pathname.startsWith("/ayuda") ? "var(--ink)" : "var(--ink-3)",
            fontSize: 13.5,
            fontWeight: pathname.startsWith("/ayuda") ? 600 : 500,
            textDecoration: "none",
          }}
        >
          <LifeBuoy
            aria-hidden="true"
            size={16}
            strokeWidth={pathname.startsWith("/ayuda") ? 2 : 1.75}
            style={{
              color: pathname.startsWith("/ayuda") ? "var(--ink)" : "var(--ink-4)",
              flexShrink: 0,
            }}
          />
          <span>Ayuda</span>
        </Link>
        <Link
          href="/perfil"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
            textDecoration: "none",
            color: "inherit",
            padding: "6px 8px",
            borderRadius: 8,
          }}
          aria-label="Ver mi perfil"
        >
          <Avatar name={user.name} size={28} src={user.avatarUrl} />
          <div style={{ lineHeight: 1.15, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {user.name}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{user.subtitle}</div>
          </div>
        </Link>
      </div>
    </aside>
  );
}

export const ADMIN_SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "home",
    label: "Inicio",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    id: "reviews",
    label: "Reseñas",
    items: [
      { id: "verification", label: "Verificación", href: "/resenas/verificacion", icon: ListChecks },
      { id: "review-list", label: "Lista de reseñas", href: "/manager/resenas", icon: Star },
      { id: "export", label: "Exportar Excel", href: "/manager/export", icon: Download },
    ],
  },
  {
    id: "team",
    label: "Equipo",
    items: [
      // Directores arriba: son responsables de oficina (jerarquía visible).
      // Pagina dedicada desde la migración 013: /directores.
      {
        id: "directors",
        label: "Directores",
        href: "/directores",
        icon: Building2,
      },
      { id: "sales", label: "Comerciales", href: "/comerciales", icon: Users },
      { id: "managers", label: "Gestores", href: "/gestores", icon: UserCog },
    ],
  },
  {
    id: "config",
    label: "Configuración",
    items: [
      { id: "branches", label: "Fichas Google", href: "/fichas", icon: MapPin },
    ],
  },
];

export const SALES_SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "main",
    items: [
      { id: "panel", label: "Mi panel", href: "/panel", icon: LayoutDashboard },
      { id: "link", label: "Mi enlace", href: "/panel/enlace", icon: Link2 },
      { id: "clients", label: "Mis clientes", href: "/clientes", icon: Users },
      { id: "reviews", label: "Mis reseñas", href: "/panel/resenas", icon: Star },
    ],
  },
];

export const MANAGER_SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "main",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { id: "team", label: "Comerciales", href: "/comerciales", icon: Users },
      { id: "reviews", label: "Reseñas", href: "/manager/resenas", icon: Star },
      { id: "export", label: "Exportar Excel", href: "/manager/export", icon: Download },
    ],
  },
];

// Director de oficina: admin scoped a su location. Misma IA que admin pero
// sin Gestores ni Ajustes globales, y "Fichas Google" se muestra como "Mi
// ficha" porque solo verá la suya. /manager/export lo aprovecha para Excel
// (con el location_id forzado server-side al suyo).
export const OFFICE_DIRECTOR_SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "home",
    label: "Inicio",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    id: "reviews",
    label: "Reseñas",
    items: [
      { id: "verification", label: "Verificación", href: "/resenas/verificacion", icon: ListChecks },
      { id: "export", label: "Exportar Excel", href: "/manager/export", icon: Download },
    ],
  },
  {
    id: "team",
    label: "Mi oficina",
    items: [
      { id: "sales", label: "Comerciales", href: "/comerciales", icon: Users },
      { id: "branch", label: "Mi ficha", href: "/fichas", icon: MapPin },
    ],
  },
];
