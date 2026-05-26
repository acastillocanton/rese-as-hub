import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { RangePicker } from "@/components/ui/RangePicker";
import { LeaderboardTable } from "@/components/ranking/LeaderboardTable";
import { getLeaderboard } from "@/lib/leaderboard";
import { parseRange, defaultShortcuts } from "@/lib/date-range";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb } from "@/lib/branding";

// El ranking depende del rango temporal en la query string, así que
// no se puede cachear estáticamente entre usuarios.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;

export default async function RankingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const now = new Date();
  const range = parseRange(params.from, params.to, now);
  const shortcuts = defaultShortcuts(now);
  const brand = await getCurrentUserBrand();

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Ranking"
          subtitle="Producción del equipo"
          range={null}
          breadcrumb={getBrandBreadcrumb(brand)}
        />
        <div style={{ padding: "24px 32px" }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para ver el ranking real.
            </div>
          </Card>
        </div>
      </>
    );
  }

  const rows = await getLeaderboard({ startIso: range.startIso, endIso: range.endIso });

  // Empty si nadie ha producido nada en el rango. Distinto a no haber
  // productores en BD: aquí siempre hay perfiles, pero pueden estar a 0
  // si el rango está fuera de su actividad.
  const hasActivity = rows.some((r) => r.reviews > 0);

  return (
    <>
      <Topbar
        title="Ranking"
        subtitle="Producción del equipo"
        range={null}
        breadcrumb={getBrandBreadcrumb(brand)}
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
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {rows.length === 0 ? (
          <Card padding={32}>
            <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
              Sin comerciales
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                marginTop: 4,
                letterSpacing: "-0.02em",
              }}
            >
              Aún no hay productores en plantilla
            </div>
            <p style={{ margin: "10px 0 0", color: "var(--ink-3)", fontSize: 13.5, lineHeight: 1.55, maxWidth: 560 }}>
              Invita comerciales y directores desde{" "}
              <Link href="/comerciales" style={{ color: "var(--ink)" }}>Comerciales</Link>{" "}
              y{" "}
              <Link href="/directores" style={{ color: "var(--ink)" }}>Directores</Link>.
            </p>
          </Card>
        ) : !hasActivity ? (
          <Card padding={32}>
            <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
              Sin actividad en este periodo
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                marginTop: 4,
                letterSpacing: "-0.02em",
              }}
            >
              Cambia el rango o espera a la próxima sincronización
            </div>
            <p style={{ margin: "10px 0 0", color: "var(--ink-3)", fontSize: 13.5, lineHeight: 1.55, maxWidth: 560 }}>
              Ningún productor ha tenido reseñas atribuidas en el periodo seleccionado. Usa los atajos del calendario para ir al mes pasado o al último trimestre.
            </p>
          </Card>
        ) : (
          <Card padding={0}>
            <div style={{ padding: "18px 22px 6px" }}>
              <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                Ranking completo
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  marginTop: 4,
                  letterSpacing: "-0.02em",
                }}
              >
                {rows.length} {rows.length === 1 ? "productor" : "productores"} · ordenados por reseñas
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--ink-4)", lineHeight: 1.5 }}>
                Ordenados por reseñas atribuidas. Los productores sin actividad quedan al final ordenados alfabéticamente.
              </p>
            </div>
            <LeaderboardTable rows={rows} />
          </Card>
        )}
      </div>
    </>
  );
}
