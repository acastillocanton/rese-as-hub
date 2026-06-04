import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Ring } from "@/components/charts/Ring";
import { MonthBars } from "@/components/charts/MonthBars";
import { Badge } from "@/components/ui/Badge";
import { formatEuro } from "@/lib/utils";
import type { PanelBadge } from "@/lib/panel-badges";

/**
 * Resumen productivo de un comercial para la vista de GESTIÓN
 * (`/comerciales/[slug]`, visible para admin / reviews_manager / office_director).
 *
 * Espeja la foto que el comercial ve en su propio `/panel` — abonables, €,
 * objetivo, estrellas, evolución, ranking e insignias — pero con copy en
 * 3ª persona ("su equipo") y SIN los mensajes motivacionales del panel. Recibe
 * todas las métricas ya calculadas (server component-safe, sin I/O ni hooks).
 *
 * Devuelve un fragmento de varias Cards que se renderizan como hijas directas
 * del contenedor flex de la página (heredan su `gap`).
 */

export type ProducerSummaryProps = {
  /** Nombre del rango activo (range.label), p.ej. "20 may – 19 jun". */
  periodLabel: string;
  /** El rango activo ES el periodo de comisión vigente (cambia el rótulo). */
  isCommissionPeriod: boolean;
  /** El rango incluye hoy (para mostrar cierre/días restantes). */
  isCurrentPeriod: boolean;
  /** Reseñas abonables: counted, no-duplicadas, no-eliminadas, del rango. */
  counted: number;
  /** Reseñas potenciales: pending del rango. */
  pending: number;
  /** Abonables del periodo anterior (comparativa); null si no aplica. */
  prevCounted: number | null;
  /** Media de estrellas del rango (counted+pending, no-duplicadas); null si 0. */
  avgRating: number | null;
  /** Objetivo del periodo (profiles.monthly_goal). */
  goal: number;
  /** Tarifa €/reseña; null = sin tarifa configurada. */
  commissionRate: number | null;
  /** "19 jun" — día de cierre del periodo (solo se usa si isCurrentPeriod). */
  closeDate: string;
  /** Días restantes hasta el cierre (solo si isCurrentPeriod). */
  daysLeft: number;
  /** Reseñas verificadas por mes (6 meses; último = mes en curso). */
  monthBuckets: number[];
  monthLabels: string[];
  /** Posición 0-based en el ranking de su equipo; null si no aplica. */
  rankIndex: number | null;
  /** Tamaño del equipo (incluyéndose). */
  teamSize: number;
  /** Insignias calculadas (computePanelBadges). */
  badges: PanelBadge[];
  /** A dónde enlaza "Ver ranking" (en gestión → /ranking). */
  rankingHref: string;
};

function formatRating(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(1).replace(".", ",");
}

function deltaPill(current: number, previous: number | null) {
  if (previous === null) return null;
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  if (diff === 0) return <Pill withDot>=0 vs. periodo anterior</Pill>;
  const sign = diff > 0 ? "+" : "";
  return (
    <Pill tone={diff > 0 ? "ok" : "warn"} withDot>
      {sign}
      {diff} vs. periodo anterior
    </Pill>
  );
}

export function ProducerSummary(props: ProducerSummaryProps) {
  const {
    periodLabel,
    isCommissionPeriod,
    isCurrentPeriod,
    counted,
    pending,
    prevCounted,
    avgRating,
    goal,
    commissionRate,
    closeDate,
    daysLeft,
    monthBuckets,
    monthLabels,
    rankIndex,
    teamSize,
    badges,
    rankingHref,
  } = props;

  const earnedEuro = commissionRate !== null ? commissionRate * counted : null;
  const pendingEuro = commissionRate !== null ? commissionRate * pending : null;

  const monthTotal = monthBuckets.reduce((s, v) => s + v, 0);

  const position = rankIndex === null ? null : rankIndex + 1;
  const soloTeam = teamSize <= 1 || position === null;

  const sortedBadges = [...badges].sort((a, b) => Number(b.earned) - Number(a.earned));
  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <>
      {/* ── Hero productivo (factual) ── */}
      <Card padding={28}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: 32,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              {isCommissionPeriod ? "Periodo de comisión" : "Periodo"} ·{" "}
              <strong style={{ color: "var(--ink-2)", fontWeight: 600 }}>{periodLabel}</strong>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 14,
                marginTop: 6,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 64,
                  fontWeight: 600,
                  letterSpacing: "-0.035em",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {counted}
              </span>
              <span style={{ fontSize: 16, color: "var(--ink-3)" }}>reseñas abonables</span>
              {deltaPill(counted, prevCounted)}
            </div>

            {earnedEuro !== null ? (
              <div style={{ marginTop: 10, fontSize: 14, color: "var(--ink-2)" }}>
                ≈{" "}
                <strong style={{ color: "var(--ink)", fontSize: 16 }}>
                  {formatEuro(earnedEuro)}
                </strong>{" "}
                en comisión
                {pending > 0 && pendingEuro !== null && (
                  <span style={{ color: "var(--ink-4)" }}>
                    {" "}· +{formatEuro(pendingEuro)} si se verifican las {pending} pendientes
                  </span>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--ink-4)" }}>
                Sin tarifa €/reseña configurada (se fija en la ficha, abajo).
              </div>
            )}

            <div
              style={{
                marginTop: 18,
                display: "flex",
                gap: 32,
                color: "var(--ink-3)",
                fontSize: 13,
                flexWrap: "wrap",
              }}
            >
              <span>
                <span style={{ color: "var(--ink-4)" }}>Por verificar</span>{" "}
                <strong style={{ color: "var(--ink)" }}>{pending}</strong>
              </span>
              <span>
                <span style={{ color: "var(--ink-4)" }}>Estrellas</span>{" "}
                <strong style={{ color: "var(--ink)" }}>{formatRating(avgRating)}</strong>
              </span>
              {isCurrentPeriod && (
                <span>
                  <span style={{ color: "var(--ink-4)" }}>Cierra el</span>{" "}
                  <strong style={{ color: "var(--ink)" }}>{closeDate}</strong>
                  <span style={{ color: "var(--ink-4)" }}> · faltan {daysLeft} días</span>
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Ring value={counted} max={goal} size={140} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Objetivo del periodo</div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  marginTop: 4,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {counted} / {goal}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Evolución 6 meses ── */}
      <Card padding={24}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
            Evolución · reseñas verificadas por mes
          </div>
          <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
            {monthTotal} en los últimos {monthBuckets.length} meses
          </span>
        </div>
        <div style={{ marginTop: 18 }}>
          <MonthBars
            data={monthBuckets}
            labels={monthLabels}
            height={200}
            highlight={monthBuckets.length - 1}
          />
        </div>
      </Card>

      {/* ── Posición en el equipo ── */}
      <Card padding={24}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
            Posición en su equipo
          </div>
          {!soloTeam && (
            <Link
              href={rankingHref}
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--ink-3)",
                textDecoration: "none",
              }}
            >
              Ver ranking →
            </Link>
          )}
        </div>
        {soloTeam ? (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13.5,
              color: "var(--ink-4)",
              lineHeight: 1.55,
            }}
          >
            Aún no hay compañeros en su equipo con los que compararle.
          </p>
        ) : (
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 44,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              #{position}
            </span>
            <span style={{ fontSize: 15, color: "var(--ink-3)" }}>de {teamSize} en su equipo</span>
            {position === 1 && (
              <span
                style={{
                  background: "var(--ink)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  padding: "3px 9px",
                  borderRadius: 999,
                }}
              >
                Líder
              </span>
            )}
          </div>
        )}
      </Card>

      {/* ── Insignias ── */}
      <Card padding={24}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
            Insignias del comercial
          </div>
          <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
            {earnedCount} de {badges.length} desbloqueadas
          </span>
        </div>
        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          {sortedBadges.map((b) => (
            <Badge key={b.id} badge={b} />
          ))}
        </div>
      </Card>
    </>
  );
}
