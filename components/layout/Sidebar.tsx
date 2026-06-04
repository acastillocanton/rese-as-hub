"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  type LucideIcon,
  LayoutDashboard,
  Users,
  UserCog,
  Briefcase,
  MapPin,
  ListChecks,
  Star,
  Link2,
  LifeBuoy,
  Trophy,
  MessageCircle,
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
  /** Número de conversaciones de soporte sin leer. >0 muestra badge. */
  supportUnread?: number;
};

export function Sidebar({ groups, user, supportUnread = 0 }: SidebarProps) {
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
        // Columna pegada de altura de viewport: el footer (Soporte/Ayuda/perfil)
        // queda siempre al fondo visible y el <nav> hace scroll interno si la
        // navegación supera el alto del viewport. Evita que el aside se estire
        // con el contenido del <main> (align-items: stretch del Frame).
        height: "100vh",
        position: "sticky",
        top: 0,
        overflow: "hidden",
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

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          // Absorbe el espacio sobrante y hace scroll interno (minHeight:0 es
          // necesario para que un hijo flex pueda scrollear) → footer fijo abajo.
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
        }}
      >
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
        {/* Soporte — helpdesk interno accesible a los 4 roles. Pintado en
            el footer del sidebar junto a Ayuda y el avatar del usuario. */}
        <Link
          href="/soporte"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 10px",
            borderRadius: 8,
            background: pathname.startsWith("/soporte") ? "rgba(0,0,0,0.05)" : "transparent",
            color: pathname.startsWith("/soporte") ? "var(--ink)" : "var(--ink-3)",
            fontSize: 13.5,
            fontWeight: pathname.startsWith("/soporte") ? 600 : 500,
            textDecoration: "none",
          }}
        >
          <MessageCircle
            aria-hidden="true"
            size={16}
            strokeWidth={pathname.startsWith("/soporte") ? 2 : 1.75}
            style={{
              color: pathname.startsWith("/soporte") ? "var(--ink)" : "var(--ink-4)",
              flexShrink: 0,
            }}
          />
          <span>Soporte</span>
          {supportUnread > 0 && (
            <span
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 999,
                background: "#2563eb",
                color: "#fff",
                fontSize: 10.5,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {supportUnread > 99 ? "99+" : supportUnread}
            </span>
          )}
        </Link>
        {/* Centro de ayuda — accesible a los cuatro roles. Pintado justo
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
      { id: "ranking", label: "Ranking", href: "/ranking", icon: Trophy },
    ],
  },
  {
    id: "reviews",
    label: "Reseñas",
    items: [
      { id: "verification", label: "Verificación", href: "/resenas/verificacion", icon: ListChecks },
      { id: "review-list", label: "Lista de reseñas", href: "/manager/resenas", icon: Star },
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
        icon: Briefcase,
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
      // Ranking del equipo del comercial (mismo director_id). En móvil ya
      // está como pestaña de la MobileTabBar; en desktop lo exponemos aquí.
      { id: "ranking", label: "Ranking", href: "/panel/ranking", icon: Trophy },
    ],
  },
  {
    id: "reviews",
    label: "Reseñas",
    items: [
      { id: "reviews", label: "Mis reseñas", href: "/panel/resenas", icon: Star },
      // Verificación: el comercial puede reclamar reseñas huérfanas de su
      // ficha que no entraron por su enlace personal (mig 016).
      { id: "verification", label: "Verificación", href: "/resenas/verificacion", icon: ListChecks },
    ],
  },
];

export const MANAGER_SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "main",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { id: "ranking", label: "Ranking", href: "/ranking", icon: Trophy },
      { id: "team", label: "Comerciales", href: "/comerciales", icon: Users },
      // Verificación: paridad con admin sobre matching manual de reseñas
      // (mig 016 abre /resenas/verificacion al gestor).
      { id: "verification", label: "Verificación", href: "/resenas/verificacion", icon: ListChecks },
      { id: "reviews", label: "Reseñas", href: "/manager/resenas", icon: Star },
    ],
  },
];

// Director de oficina: rol DUAL — productor (sales-like, con su /c/{slug}
// y sus reseñas) + admin de su equipo (sales con director_id = él).
// Sidebar refleja la dualidad: "Mi panel" (productor) arriba, "Mi oficina"
// (gestor) abajo. NO ve /gestores ni /directores ni /ajustes.
export const OFFICE_DIRECTOR_SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "home",
    label: "Inicio",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    id: "panel",
    label: "Mi panel",
    items: [
      { id: "link", label: "Mi enlace", href: "/panel/enlace", icon: Link2 },
      { id: "myclients", label: "Mis clientes", href: "/clientes", icon: Users },
      { id: "myreviews", label: "Mis reseñas", href: "/panel/resenas", icon: Star },
    ],
  },
  {
    id: "team",
    label: "Mi oficina",
    items: [
      { id: "verification", label: "Verificación", href: "/resenas/verificacion", icon: ListChecks },
      { id: "sales", label: "Comerciales", href: "/comerciales", icon: Users },
      { id: "branch", label: "Mi ficha", href: "/fichas", icon: MapPin },
      // Ranking del equipo del director (filtrado por RLS) — él mismo
      // aparece como una fila más del leaderboard porque es productor.
      { id: "team-ranking", label: "Ranking", href: "/ranking", icon: Trophy },
    ],
  },
];
