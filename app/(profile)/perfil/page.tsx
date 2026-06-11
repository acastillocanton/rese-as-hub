import Link from "next/link";
import { LifeBuoy, LogOut, MessageCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PhotoUpload } from "./PhotoUpload";
import { DEFAULT_BRAND, getBrandBreadcrumb } from "@/lib/branding";
import type { Brand } from "@/lib/supabase/types";

type ProfileRow = {
  id: string;
  full_name: string;
  email: string | null;
  role: "admin" | "sales" | "reviews_manager" | "office_director";
  slug: string;
  status: "invited" | "active" | "paused";
  avatar_url: string | null;
  locations: { brand: Brand } | null;
};

function roleLabel(role: ProfileRow["role"]): string {
  if (role === "admin") return "Administrador";
  if (role === "reviews_manager") return "Gestor de reseñas";
  if (role === "office_director") return "Responsable de oficina";
  return "Comercial";
}

function statusLabel(status: ProfileRow["status"]): string {
  if (status === "active") return "Activo";
  if (status === "paused") return "Pausado";
  return "Invitado";
}

export default async function PerfilPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Mi perfil"
          subtitle="Modo demo — sin base de datos"
          breadcrumb={getBrandBreadcrumb(DEFAULT_BRAND)}
          range={null}
        />
        <div style={{ padding: "24px 32px" }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para ver tu perfil real.
            </div>
          </Card>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profileRes = await supabase
    .from("profiles")
    .select("id, full_name, email, role, slug, status, avatar_url, locations:locations(brand)")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  const profile = profileRes.data;
  if (!profile) redirect("/login");
  const brand: Brand = profile.locations?.brand ?? DEFAULT_BRAND;

  // Conversaciones de soporte sin leer — alimenta el badge de la tarjeta
  // "Ayuda y soporte". En mobile esta tarjeta es el ÚNICO punto de entrada
  // a /soporte y /ayuda (el footer del sidebar está oculto, ver §4.45).
  let supportUnread = 0;
  const { data: unreadData } = await supabase.rpc("support_unread_count");
  if (typeof unreadData === "number") supportUnread = unreadData;

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";

  const isSales = profile.role === "sales";
  const isDirector = profile.role === "office_director";
  // Sales y office_director tienen MobileTabBar — no necesitan botón Volver.
  // Admin/reviews_manager no tienen tab bar mobile: en mobile mostramos
  // un botón explícito para volver al dashboard.
  const hasMobileTabBar = isSales || isDirector;
  const backHref = isSales ? "/panel" : "/dashboard";

  return (
    <>
      <Topbar
        title="Mi perfil"
        subtitle="Tu información en ReseñaHub"
        breadcrumb={getBrandBreadcrumb(brand)}
        range={null}
        compact
        right={
          !hasMobileTabBar ? (
            <Link
              href={backHref}
              className="m-mobile-only"
              style={{
                padding: "7px 12px",
                border: "1px solid var(--line-strong)",
                borderRadius: 9,
                fontSize: 13,
                color: "var(--ink-2)",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              ← Volver
            </Link>
          ) : undefined
        }
      />

      <div
        className={hasMobileTabBar ? "m-page-pad" : undefined}
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          maxWidth: 760,
        }}
      >
        <Card padding={28} className="profile-card">
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 14,
              fontWeight: 600,
            }}
          >
            Foto de perfil
          </div>
          <PhotoUpload
            name={profile.full_name}
            initialAvatarUrl={profile.avatar_url}
          />
        </Card>

        <Card padding={28} className="profile-card">
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 14,
              fontWeight: 600,
            }}
          >
            Datos de cuenta
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Nombre" value={profile.full_name} />
            <Field label="Email" value={profile.email ?? "—"} mono />
            <Field
              label="Rol"
              value={
                <Pill withDot tone={profile.role === "admin" ? "ok" : "neutral"}>
                  {roleLabel(profile.role)}
                </Pill>
              }
            />
            <Field
              label="Estado"
              value={
                <Pill withDot tone={profile.status === "active" ? "ok" : "warn"}>
                  {statusLabel(profile.status)}
                </Pill>
              }
            />
            <Field label="Identificador" value={profile.slug} mono />
            <Field label="Miembro desde" value={memberSince} />
          </div>
          <p
            style={{
              margin: "20px 0 0",
              fontSize: 12,
              color: "var(--ink-4)",
              lineHeight: 1.55,
            }}
          >
            ¿Necesitas cambiar tu nombre, email o rol? Pide al administrador que
            actualice tu ficha desde Comerciales o Gestores.
          </p>
        </Card>

        <Card padding={28} className="profile-card">
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 14,
              fontWeight: 600,
            }}
          >
            Ayuda y soporte
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <HelpLink
              href="/soporte"
              icon={<MessageCircle size={17} strokeWidth={1.75} aria-hidden="true" />}
              title="Soporte"
              description="Abre una consulta o sigue tus conversaciones con el equipo."
              badge={supportUnread}
            />
            <HelpLink
              href="/ayuda"
              icon={<LifeBuoy size={17} strokeWidth={1.75} aria-hidden="true" />}
              title="Centro de ayuda"
              description="Manual paso a paso de la plataforma, con capturas."
            />
          </div>
        </Card>

        <Card padding={28} className="profile-card">
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 14,
              fontWeight: 600,
            }}
          >
            Sesión
          </div>
          <div
            className="profile-session-row"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.5, maxWidth: 460 }}>
              Cerrarás sesión en este dispositivo. Para volver a entrar tendrás que
              pedir un nuevo enlace mágico desde la pantalla de login.
            </div>
            <form action="/auth/signout" method="post" style={{ margin: 0 }}>
              <button
                type="submit"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 14px",
                  borderRadius: 8,
                  background: "#fff",
                  border: "1px solid var(--line)",
                  color: "#B42318",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
                Cerrar sesión
              </button>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}

function HelpLink({
  href,
  icon,
  title,
  description,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        border: "1px solid var(--line)",
        borderRadius: 10,
        textDecoration: "none",
        background: "#fff",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          borderRadius: 9,
          background: "var(--bg)",
          border: "1px solid var(--line)",
          color: "var(--ink-3)",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          {title}
          {badge !== undefined && badge > 0 && (
            <span
              style={{
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
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        <span style={{ fontSize: 12.5, color: "var(--ink-4)", lineHeight: 1.45 }}>
          {description}
        </span>
      </span>
    </Link>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      className="profile-field"
      style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        gap: 16,
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--ink-4)" }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          color: "var(--ink)",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          fontWeight: typeof value === "string" ? 500 : undefined,
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  );
}
