import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProfileStatus } from "@/lib/supabase/types";
import { InviteManagerButton } from "./InviteManagerButton";
import { DeleteManagerButton } from "./DeleteManagerButton";
import { InviteDirectorButton } from "./InviteDirectorButton";
import { DeleteDirectorButton } from "./DeleteDirectorButton";
import { ResendAccessButton } from "@/components/ui/ResendAccessButton";
import { resendManagerAccess, resendDirectorAccess } from "./actions";

type ManagerRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: ProfileStatus;
  joined_at: string;
};

type DirectorRow = ManagerRow & {
  location: { id: string; name: string } | null;
};

type LocationOption = { id: string; name: string };

export default async function GestoresPage() {
  let managers: ManagerRow[] = [];
  let directors: DirectorRow[] = [];
  let locations: LocationOption[] = [];
  let dbError: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [managersRes, directorsRes, locsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, phone, status, joined_at")
        .eq("role", "reviews_manager")
        .order("joined_at", { ascending: false })
        .returns<ManagerRow[]>(),
      supabase
        .from("profiles")
        .select(
          "id, full_name, email, phone, status, joined_at, location:locations(id, name)",
        )
        .eq("role", "office_director")
        .order("joined_at", { ascending: false }),
      supabase.from("locations").select("id, name").order("name"),
    ]);
    if (managersRes.error) dbError = managersRes.error.message;
    else managers = managersRes.data ?? [];
    if (!dbError && directorsRes.error) dbError = directorsRes.error.message;
    else directors = ((directorsRes.data ?? []) as unknown) as DirectorRow[];
    if (locsRes.data) locations = locsRes.data as LocationOption[];
  }

  const stats = {
    total: managers.length,
    active: managers.filter((m) => m.status === "active").length,
    invited: managers.filter((m) => m.status === "invited").length,
    paused: managers.filter((m) => m.status === "paused").length,
  };
  const directorStats = {
    total: directors.length,
    active: directors.filter((d) => d.status === "active").length,
    invited: directors.filter((d) => d.status === "invited").length,
  };

  return (
    <>
      <Topbar
        title="Gestores y directores"
        subtitle="Gestores globales + directores de oficina"
        range={`${stats.total + directorStats.total} en plantilla`}
        breadcrumb="Inseryal"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <InviteManagerButton />
            <InviteDirectorButton locations={locations} primary />
          </div>
        }
      />

      <div style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
        {dbError && (
          <Card>
            <div style={{ fontSize: 13, color: "var(--warn)", fontWeight: 500 }}>
              Error al cargar gestores
            </div>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 12.5,
                color: "var(--ink-3)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {dbError}
            </p>
          </Card>
        )}

        {!dbError && (
          <>
            <SectionHeader title="Gestores de reseñas" hint="Visión global, gestión de comerciales y export Excel" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <MiniStat label="Total" value={stats.total} sub="gestores en plantilla" />
              <MiniStat label="Activos" value={stats.active} sub="con acceso al panel" />
              <MiniStat label="Invitados" value={stats.invited} sub="pendientes de aceptar" />
              <MiniStat label="Pausados" value={stats.paused} sub="sin actividad reciente" />
            </div>

            {managers.length === 0 ? (
              <Card padding={32}>
                <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                  Sin gestores todavía
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    marginTop: 4,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Invita a tu primer gestor de reseñas
                </div>
                <p
                  style={{
                    margin: "10px 0 16px",
                    color: "var(--ink-3)",
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    maxWidth: 560,
                  }}
                >
                  El gestor de reseñas comparte vista con el admin: gestiona
                  comerciales (invitar, editar, eliminar) y ve el listado
                  global de reseñas con descarga del Excel mensual. No accede
                  a fichas Google, otros gestores ni verificación de reseñas.
                </p>
                <InviteManagerButton primary />
              </Card>
            ) : (
              <Card padding={0}>
                <div
                  style={{
                    padding: "12px 22px",
                    borderBottom: "1px solid var(--line)",
                    display: "grid",
                    gridTemplateColumns: "2fr 1.4fr 1fr 0.8fr 200px",
                    gap: 14,
                    fontSize: 11,
                    color: "var(--ink-4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  <span>Gestor</span>
                  <span>Email</span>
                  <span>Teléfono</span>
                  <span>Estado</span>
                  <span></span>
                </div>
                {managers.map((m, i) => (
                  <ManagerRowView
                    key={m.id}
                    m={m}
                    last={i === managers.length - 1}
                  />
                ))}
              </Card>
            )}

            <div style={{ marginTop: 32 }}>
              <SectionHeader
                title="Directores de oficina"
                hint="Gestionan UNA ficha como un admin: comerciales, reseñas y conexión Google de su oficina"
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <MiniStat
                  label="Total"
                  value={directorStats.total}
                  sub={`director${directorStats.total === 1 ? "" : "es"} en plantilla`}
                />
                <MiniStat
                  label="Activos"
                  value={directorStats.active}
                  sub="con acceso al panel"
                />
                <MiniStat
                  label="Invitados"
                  value={directorStats.invited}
                  sub="pendientes de aceptar"
                />
              </div>

              {directors.length === 0 ? (
                <Card padding={32}>
                  <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                    Sin directores de oficina todavía
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      marginTop: 4,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Asigna un responsable a cada ficha
                  </div>
                  <p
                    style={{
                      margin: "10px 0 16px",
                      color: "var(--ink-3)",
                      fontSize: 13.5,
                      lineHeight: 1.55,
                      maxWidth: 560,
                    }}
                  >
                    El director ve y gestiona los datos de su ficha (oficina)
                    como un admin local: comerciales, reseñas, conexión Google.
                    No accede a otras oficinas, ni a /gestores o /ajustes.
                  </p>
                  <InviteDirectorButton locations={locations} primary />
                </Card>
              ) : (
                <Card padding={0}>
                  <div
                    style={{
                      padding: "12px 22px",
                      borderBottom: "1px solid var(--line)",
                      display: "grid",
                      gridTemplateColumns: "2fr 1.2fr 1.4fr 0.8fr 200px",
                      gap: 14,
                      fontSize: 11,
                      color: "var(--ink-4)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    <span>Director</span>
                    <span>Oficina</span>
                    <span>Email</span>
                    <span>Estado</span>
                    <span></span>
                  </div>
                  {directors.map((d, i) => (
                    <DirectorRowView
                      key={d.id}
                      d={d}
                      last={i === directors.length - 1}
                    />
                  ))}
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-4)", marginTop: 2 }}>{hint}</div>
    </div>
  );
}

function DirectorRowView({ d, last }: { d: DirectorRow; last: boolean }) {
  const tone =
    d.status === "active" ? "ok" : d.status === "paused" ? "warn" : "neutral";
  const label =
    d.status === "active" ? "Activo" : d.status === "paused" ? "Pausado" : "Invitado";
  return (
    <div
      style={{
        padding: "14px 22px",
        borderBottom: last ? "none" : "1px solid var(--line)",
        display: "grid",
        gridTemplateColumns: "2fr 1.2fr 1.4fr 0.8fr 200px",
        gap: 14,
        alignItems: "center",
        fontSize: 13.5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <Avatar name={d.full_name} size={32} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              letterSpacing: "-0.005em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "var(--ink)",
            }}
          >
            {d.full_name}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
            Director de oficina · gestiona su ficha
          </div>
        </div>
      </div>
      <span
        style={{
          fontSize: 13,
          color: d.location ? "var(--ink-2)" : "var(--ink-4)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {d.location?.name ?? "—"}
      </span>
      <span
        style={{
          fontSize: 12.5,
          color: "var(--ink-3)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {d.email ?? "—"}
      </span>
      <span>
        <Pill tone={tone} withDot>
          {label}
        </Pill>
      </span>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <ResendAccessButton id={d.id} name={d.full_name} action={resendDirectorAccess} />
        <DeleteDirectorButton id={d.id} name={d.full_name} />
      </div>
    </div>
  );
}

function ManagerRowView({ m, last }: { m: ManagerRow; last: boolean }) {
  const tone =
    m.status === "active" ? "ok" : m.status === "paused" ? "warn" : "neutral";
  const label =
    m.status === "active" ? "Activo" : m.status === "paused" ? "Pausado" : "Invitado";
  return (
    <div
      style={{
        padding: "14px 22px",
        borderBottom: last ? "none" : "1px solid var(--line)",
        display: "grid",
        gridTemplateColumns: "2fr 1.4fr 1fr 0.8fr 200px",
        gap: 14,
        alignItems: "center",
        fontSize: 13.5,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
        }}
      >
        <Avatar name={m.full_name} size={32} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              letterSpacing: "-0.005em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "var(--ink)",
            }}
          >
            {m.full_name}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
            }}
          >
            Gestor de reseñas · gestiona comerciales
          </div>
        </div>
      </div>
      <span
        style={{
          fontSize: 12.5,
          color: "var(--ink-3)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {m.email ?? "—"}
      </span>
      <span
        style={{
          fontSize: 12.5,
          color: "var(--ink-3)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {m.phone ?? "—"}
      </span>
      <span>
        <Pill tone={tone} withDot>
          {label}
        </Pill>
      </span>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <ResendAccessButton id={m.id} name={m.full_name} action={resendManagerAccess} />
        <DeleteManagerButton id={m.id} name={m.full_name} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <Card padding={16}>
      <div
        style={{
          fontSize: 11.5,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          letterSpacing: "-0.025em",
          fontSize: 24,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--ink-4)" }}>{sub}</div>
    </Card>
  );
}
