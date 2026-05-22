import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PhotoUpload } from "./PhotoUpload";

type ProfileRow = {
  id: string;
  full_name: string;
  email: string | null;
  role: "admin" | "sales" | "reviews_manager";
  slug: string;
  status: "invited" | "active" | "paused";
  avatar_url: string | null;
};

function roleLabel(role: ProfileRow["role"]): string {
  if (role === "admin") return "Administrador";
  if (role === "reviews_manager") return "Gestor de reseñas";
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
          breadcrumb="Inseryal"
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
    .select("id, full_name, email, role, slug, status, avatar_url")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  const profile = profileRes.data;
  if (!profile) redirect("/login");

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";

  const isSales = profile.role === "sales";

  return (
    <>
      <Topbar
        title="Mi perfil"
        subtitle="Tu información en ReseñaHub"
        breadcrumb="Inseryal"
        range={null}
        compact={isSales}
      />

      <div
        className={isSales ? "sales-page-pad" : undefined}
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
        <Card padding={28}>
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

        <Card padding={28}>
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

        <Card padding={28}>
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
        }}
      >
        {value}
      </span>
    </div>
  );
}
