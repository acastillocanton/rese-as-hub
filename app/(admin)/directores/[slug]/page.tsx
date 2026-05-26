import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProfileStatus, SalesDepartment } from "@/lib/supabase/types";
import { ResendAccessButton } from "@/components/ui/ResendAccessButton";
import { resendDirectorAccess } from "../actions";
import { ArchiveDirectorButton } from "../ArchiveDirectorButton";
import { DeleteDirectorButton } from "../DeleteDirectorButton";
import { DirectorEditCard } from "./DirectorEditCard";

type DirectorDetail = {
  id: string;
  full_name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  status: ProfileStatus;
  joined_at: string;
  location_id: string | null;
  location: { id: string; name: string } | null;
  department: SalesDepartment | null;
  language: string | null;
  monthly_goal: number;
  archived_at: string | null;
};

type TeamSales = {
  id: string;
  full_name: string;
  slug: string;
  status: ProfileStatus;
  department: SalesDepartment | null;
  language: string | null;
};

type PageProps = {
  params: Promise<{ slug: string }>;
};

const DEPARTMENT_LABELS: Record<SalesDepartment, string> = {
  nacional: "Nacional",
  internacional: "Internacional",
  castellon: "Castellón",
  valencia: "Valencia",
};

function statusLabel(s: ProfileStatus): string {
  if (s === "active") return "Activo";
  if (s === "paused") return "Pausado";
  if (s === "archived") return "Archivado";
  return "Invitado";
}

export default async function DirectorDetailPage({ params }: PageProps) {
  const { slug } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar title="Director" subtitle="Modo demo — sin base de datos" breadcrumb="Directores" />
        <div style={{ padding: "24px 32px" }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para ver el detalle del director.
            </div>
          </Card>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  // Acceso: admin y reviews_manager pueden entrar al detalle. Otros roles
  // se redirigen a su home — el middleware ya cubre /directores pero el
  // detalle [slug] hereda y conviene doble guard.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: viewer } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (viewer?.role !== "admin" && viewer?.role !== "reviews_manager") {
    redirect("/dashboard");
  }

  const [directorRes, locsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, slug, email, phone, status, joined_at, location_id, department, language, monthly_goal, archived_at, location:locations(id, name)",
      )
      .eq("slug", slug)
      .eq("role", "office_director")
      .maybeSingle<DirectorDetail>(),
    supabase.from("locations").select("id, name").order("name"),
  ]);

  const director = directorRes.data;
  if (!director) notFound();

  const locations = (locsRes.data ?? []) as { id: string; name: string }[];

  // Equipo del director — sales con director_id = director.id (incluido
  // archivados, para que el operador sepa el alcance histórico).
  const { data: teamRaw } = await supabase
    .from("profiles")
    .select("id, full_name, slug, status, department, language")
    .eq("role", "sales")
    .eq("director_id", director.id)
    .order("status", { ascending: true })
    .order("full_name", { ascending: true })
    .returns<TeamSales[]>();
  const team = teamRaw ?? [];
  const activeTeam = team.filter((t) => t.status !== "archived");
  const archivedTeam = team.filter((t) => t.status === "archived");

  const isArchived = director.status === "archived";

  return (
    <>
      <Topbar
        title={director.full_name}
        subtitle={`Director · ${director.location?.name ?? "sin ficha"} · ${statusLabel(director.status)}`}
        breadcrumb="Directores"
        range={null}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/directores" style={linkBtn}>
              ← Todos
            </Link>
            {!isArchived && (
              <ResendAccessButton
                id={director.id}
                name={director.full_name}
                action={resendDirectorAccess}
                variant="prominent"
              />
            )}
            <ArchiveDirectorButton
              id={director.id}
              name={director.full_name}
              teamCount={activeTeam.length}
              mode={isArchived ? "restore" : "archive"}
              redirectTo={isArchived ? undefined : "/directores"}
              variant="prominent"
            />
            <DeleteDirectorButton id={director.id} name={director.full_name} />
          </div>
        }
      />

      <div
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "grid",
          gridTemplateColumns: "minmax(320px, 1.1fr) minmax(320px, 1.6fr)",
          gap: 18,
        }}
      >
        {/* Datos del director (editable) */}
        {!isArchived ? (
          <DirectorEditCard
            id={director.id}
            email={director.email}
            phone={director.phone}
            fullName={director.full_name}
            joinedAt={director.joined_at}
            locations={locations}
            initial={{
              locationId: director.location_id,
              department: director.department,
              language: director.language,
              monthlyGoal: director.monthly_goal,
              status: director.status,
            }}
          />
        ) : (
          <Card>
            <div style={sectionLabel}>Director archivado</div>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 13,
                color: "var(--ink-3)",
                lineHeight: 1.55,
              }}
            >
              Este director está archivado. Para editar sus datos restáuralo
              primero con el botón &quot;Restaurar director&quot; del topbar.
            </p>
            <dl style={{ marginTop: 14, display: "grid", rowGap: 10 }}>
              <Row label="Nombre" value={director.full_name} />
              <Row label="Email" value={director.email ?? "—"} mono />
              <Row label="Teléfono" value={director.phone ?? "—"} />
              <Row label="Oficina" value={director.location?.name ?? "—"} />
            </dl>
          </Card>
        )}

        {/* Equipo del director */}
        <Card padding={0}>
          <div
            style={{
              padding: "14px 22px",
              borderBottom: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <div style={sectionLabel}>Equipo</div>
              <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>
                Comerciales bajo la dirección de {director.full_name}
              </div>
            </div>
            <Pill withDot tone={activeTeam.length > 0 ? "ok" : "neutral"}>
              {activeTeam.length} activo{activeTeam.length === 1 ? "" : "s"}
            </Pill>
          </div>

          {team.length === 0 ? (
            <div style={{ padding: "20px 22px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "var(--ink-3)",
                  lineHeight: 1.55,
                }}
              >
                Este director aún no tiene comerciales asignados. Para añadir
                uno, edita un comercial desde{" "}
                <Link href="/comerciales" style={{ color: "var(--ink)" }}>
                  /comerciales
                </Link>{" "}
                y selecciónalo en &quot;Director responsable&quot;.
              </p>
            </div>
          ) : (
            <div style={{ padding: "4px 0" }}>
              {activeTeam.map((s, i) => (
                <TeamRow
                  key={s.id}
                  s={s}
                  last={i === activeTeam.length - 1 && archivedTeam.length === 0}
                />
              ))}
              {archivedTeam.length > 0 && (
                <>
                  <div
                    style={{
                      padding: "10px 22px",
                      fontSize: 11,
                      color: "var(--ink-4)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      borderTop: "1px solid var(--line)",
                      borderBottom: "1px solid var(--line)",
                      background: "var(--surface-2)",
                    }}
                  >
                    Archivados ({archivedTeam.length})
                  </div>
                  {archivedTeam.map((s, i) => (
                    <TeamRow
                      key={s.id}
                      s={s}
                      last={i === archivedTeam.length - 1}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function TeamRow({ s, last }: { s: TeamSales; last: boolean }) {
  const tone =
    s.status === "active"
      ? "ok"
      : s.status === "paused"
        ? "warn"
        : s.status === "archived"
          ? "neutral"
          : "neutral";
  const label = statusLabel(s.status);
  // Zona = idioma si internacional; departamento en otro caso.
  const zone =
    s.department === "internacional"
      ? s.language ?? "—"
      : s.department
        ? DEPARTMENT_LABELS[s.department]
        : "—";
  return (
    <Link
      href={`/comerciales/${s.slug}`}
      style={{
        padding: "12px 22px",
        borderBottom: last ? "none" : "1px solid var(--line)",
        display: "grid",
        gridTemplateColumns: "1.6fr 1fr 0.7fr",
        gap: 14,
        alignItems: "center",
        fontSize: 13.5,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Avatar name={s.full_name} size={28} />
        <span
          style={{
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {s.full_name}
        </span>
      </div>
      <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{zone}</span>
      <span style={{ display: "flex", justifyContent: "flex-end" }}>
        <Pill tone={tone} withDot>
          {label}
        </Pill>
      </span>
    </Link>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 14 }}>
      <dt
        style={{
          fontSize: 12,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          fontSize: 13.5,
          fontFamily: mono ? "var(--font-mono)" : undefined,
          color: value === "—" ? "var(--ink-4)" : "var(--ink-2)",
        }}
      >
        {value}
      </dd>
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: "-0.02em",
};

const linkBtn: React.CSSProperties = {
  padding: "7px 12px",
  background: "transparent",
  border: "1px solid var(--line-strong)",
  borderRadius: 9,
  fontSize: 13,
  color: "var(--ink-2)",
  textDecoration: "none",
  fontWeight: 500,
};
