import { redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { RangePicker } from "@/components/ui/RangePicker";
import { LeaderboardCardList } from "@/components/ranking/LeaderboardCardList";
import { getLeaderboard } from "@/lib/leaderboard";
import { parseRange, commissionPeriodRange, commissionShortcuts } from "@/lib/date-range";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// El ranking depende del rango temporal y del usuario logueado.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;

export default async function SalesRankingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const now = new Date();
  // El ranking del comercial se alinea al periodo de comisión (20→19) por
  // defecto, igual que el resto de su panel.
  const range = parseRange(params.from, params.to, now, commissionPeriodRange);
  const shortcuts = commissionShortcuts(now);

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Ranking"
          subtitle="Tu posición en el equipo"
          breadcrumb="Mi panel"
          breadcrumbHref="/panel"
          range={null}
          compact
        />
        <div style={{ padding: 24 }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para ver el ranking.
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, director_id")
    .eq("id", user.id)
    .maybeSingle<{ id: string; role: string; director_id: string | null }>();

  // Esta pantalla es para el rol sales. Admin / reviews_manager /
  // office_director tienen su propio /ranking con RangePicker desktop.
  if (!profile || profile.role !== "sales") {
    redirect("/ranking");
  }

  const rows = await getLeaderboard({
    startIso: range.startIso,
    endIso: range.endIso,
    teamFilter: { directorId: profile.director_id },
    currentUserId: profile.id,
    // Ranking por reseñas VERIFICADAS (abonables) — coherente con la comisión.
    metric: "counted",
  });

  const teamSize = rows.length;
  const teamLabel =
    profile.director_id === null
      ? "comerciales sin equipo asignado"
      : "miembros en tu equipo";

  return (
    <>
      <Topbar
        title="Ranking"
        subtitle="Tu posición en el equipo"
        breadcrumb="Mi panel"
        breadcrumbHref="/panel"
        range={null}
        compact
        right={
          <RangePicker
            from={range.from}
            to={range.to}
            label={range.label}
            shortcuts={shortcuts}
          />
        }
      />

      <div
        className="m-page-pad"
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {teamSize <= 1 ? (
          <Card padding={24}>
            <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
              Equipo de 1
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                marginTop: 4,
                letterSpacing: "-0.02em",
              }}
            >
              {profile.director_id === null
                ? "Aún no tienes director asignado"
                : "Aún no tienes compañeros en tu equipo"}
            </div>
            <p
              style={{
                margin: "10px 0 0",
                color: "var(--ink-3)",
                fontSize: 13.5,
                lineHeight: 1.55,
              }}
            >
              En cuanto haya más comerciales asignados al mismo equipo verás aquí
              su posición. Mientras tanto, aquí tienes tu producción del periodo.
            </p>
            <div style={{ marginTop: 16 }}>
              <LeaderboardCardList rows={rows} />
            </div>
          </Card>
        ) : (
          <>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--ink-4)",
                padding: "0 2px",
              }}
            >
              {teamSize} {teamLabel} · ordenados por reseñas
            </div>
            <LeaderboardCardList rows={rows} />
          </>
        )}
      </div>
    </>
  );
}
