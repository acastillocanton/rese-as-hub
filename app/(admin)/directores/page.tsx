import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProfileStatus } from "@/lib/supabase/types";
import { InviteDirectorButton } from "./InviteDirectorButton";
import { ArchiveDirectorButton } from "./ArchiveDirectorButton";
import { DeleteDirectorButton } from "./DeleteDirectorButton";
import { ResendAccessButton } from "@/components/ui/ResendAccessButton";
import { resendDirectorAccess } from "./actions";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb } from "@/lib/branding";

type PageProps = {
  searchParams: Promise<{ archived?: string }>;
};

type DirectorRow = {
  id: string;
  full_name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  status: ProfileStatus;
  joined_at: string;
  location: { id: string; name: string } | null;
};

type LocationOption = { id: string; name: string };

export default async function DirectoresPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const brand = await getCurrentUserBrand();
  const showArchived = sp.archived === "1";

  let directors: DirectorRow[] = [];
  let archivedCount = 0;
  let locations: LocationOption[] = [];
  let teamCountByDirector = new Map<string, number>();
  let dbError: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const baseQuery = supabase
      .from("profiles")
      .select(
        "id, full_name, slug, email, phone, status, joined_at, location:locations(id, name)",
      )
      .eq("role", "office_director")
      .order("joined_at", { ascending: false });

    const [directorsRes, archivedCountRes, locsRes, teamsRes] = await Promise.all([
      showArchived
        ? baseQuery.eq("status", "archived")
        : baseQuery.neq("status", "archived"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "office_director")
        .eq("status", "archived"),
      supabase.from("locations").select("id, name").order("name"),
      // Equipo: cuántos sales activos tiene cada director.
      supabase
        .from("profiles")
        .select("director_id")
        .eq("role", "sales")
        .neq("status", "archived")
        .returns<{ director_id: string | null }[]>(),
    ]);
    if (directorsRes.error) dbError = directorsRes.error.message;
    else directors = (directorsRes.data ?? []) as unknown as DirectorRow[];
    archivedCount = archivedCountRes.count ?? 0;
    if (locsRes.data) locations = locsRes.data as LocationOption[];
    if (teamsRes.data) {
      for (const row of teamsRes.data) {
        if (!row.director_id) continue;
        teamCountByDirector.set(
          row.director_id,
          (teamCountByDirector.get(row.director_id) ?? 0) + 1,
        );
      }
    }
  }

  const stats = {
    total: directors.length,
    active: directors.filter((d) => d.status === "active").length,
    invited: directors.filter((d) => d.status === "invited").length,
    paused: directors.filter((d) => d.status === "paused").length,
  };

  return (
    <>
      <Topbar
        title="Directores de oficina"
        subtitle={
          showArchived
            ? "Directores archivados"
            : "Cada director gestiona su propio equipo de comerciales"
        }
        range={
          showArchived
            ? `${directors.length} archivados`
            : `${stats.total} en plantilla`
        }
        breadcrumb={getBrandBreadcrumb(brand)}
        right={!showArchived ? <InviteDirectorButton locations={locations} primary /> : undefined}
      />

      <div style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
        {dbError && (
          <Card>
            <div style={{ fontSize: 13, color: "var(--warn)", fontWeight: 500 }}>
              Error al cargar directores
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
            {!showArchived && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <MiniStat
                  label="Total"
                  value={stats.total}
                  sub={`director${stats.total === 1 ? "" : "es"} en plantilla`}
                />
                <MiniStat
                  label="Activos"
                  value={stats.active}
                  sub="con acceso al panel"
                />
                <MiniStat
                  label="Invitados"
                  value={stats.invited}
                  sub="pendientes de aceptar"
                />
                <MiniStat
                  label="Pausados"
                  value={stats.paused}
                  sub="sin actividad reciente"
                />
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 12,
                alignItems: "center",
              }}
            >
              <Link
                href="/directores"
                style={{
                  ...tabBtn,
                  ...(showArchived ? {} : tabBtnActive),
                }}
              >
                Activos
              </Link>
              <Link
                href="/directores?archived=1"
                style={{
                  ...tabBtn,
                  ...(showArchived ? tabBtnActive : {}),
                }}
              >
                Archivados {archivedCount > 0 && `(${archivedCount})`}
              </Link>
            </div>

            {directors.length === 0 ? (
              <Card padding={32}>
                <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                  Sin directores todavía
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    marginTop: 4,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Crea el primer director y asígnale comerciales
                </div>
                <p
                  style={{
                    margin: "10px 0 16px",
                    color: "var(--ink-3)",
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    maxWidth: 620,
                  }}
                >
                  Un director gestiona su propio equipo de comerciales dentro de
                  una ficha. Puedes tener varios directores en la misma oficina
                  (p.ej. uno por idioma en Internacional). Cada uno solo ve y
                  edita los comerciales que tenga asignados (<code>director_id</code>).
                  Tras crearlo, asígnale comerciales desde{" "}
                  <Link href="/comerciales" style={{ color: "var(--ink)" }}>
                    /comerciales
                  </Link>{" "}
                  con el selector "Director responsable".
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
                    gridTemplateColumns: "2fr 1.2fr 1fr 1.2fr 0.8fr 240px",
                    gap: 14,
                    fontSize: 11,
                    color: "var(--ink-4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  <span>Director</span>
                  <span>Oficina</span>
                  <span>Equipo</span>
                  <span>Email</span>
                  <span>Estado</span>
                  <span></span>
                </div>
                {directors.map((d, i) => (
                  <DirectorRowView
                    key={d.id}
                    d={d}
                    teamCount={teamCountByDirector.get(d.id) ?? 0}
                    archived={showArchived}
                    last={i === directors.length - 1}
                  />
                ))}
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}

function DirectorRowView({
  d,
  teamCount,
  archived,
  last,
}: {
  d: DirectorRow;
  teamCount: number;
  archived: boolean;
  last: boolean;
}) {
  const tone =
    d.status === "active"
      ? "ok"
      : d.status === "paused"
        ? "warn"
        : d.status === "archived"
          ? "neutral"
          : "neutral";
  const label =
    d.status === "active"
      ? "Activo"
      : d.status === "paused"
        ? "Pausado"
        : d.status === "archived"
          ? "Archivado"
          : "Invitado";
  return (
    <div
      style={{
        padding: "14px 22px",
        borderBottom: last ? "none" : "1px solid var(--line)",
        display: "grid",
        gridTemplateColumns: "2fr 1.2fr 1fr 1.2fr 0.8fr 240px",
        gap: 14,
        alignItems: "center",
        fontSize: 13.5,
      }}
    >
      <Link
        href={`/directores/${d.slug}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
          textDecoration: "none",
          color: "inherit",
        }}
      >
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
            Director de oficina
          </div>
        </div>
      </Link>
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
          fontSize: 13,
          color: teamCount > 0 ? "var(--ink-2)" : "var(--ink-4)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {teamCount > 0
          ? `${teamCount} comercial${teamCount === 1 ? "" : "es"}`
          : "Sin equipo"}
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
        {archived ? (
          <>
            <ArchiveDirectorButton
              id={d.id}
              name={d.full_name}
              teamCount={teamCount}
              mode="restore"
            />
            <DeleteDirectorButton id={d.id} name={d.full_name} />
          </>
        ) : (
          <>
            <ResendAccessButton id={d.id} name={d.full_name} action={resendDirectorAccess} />
            <ArchiveDirectorButton id={d.id} name={d.full_name} teamCount={teamCount} />
            <DeleteDirectorButton id={d.id} name={d.full_name} />
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub: string;
}) {
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

const tabBtn: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12.5,
  color: "var(--ink-3)",
  textDecoration: "none",
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "transparent",
};

const tabBtnActive: React.CSSProperties = {
  background: "var(--surface)",
  borderColor: "var(--line-strong)",
  color: "var(--ink)",
  fontWeight: 600,
};
