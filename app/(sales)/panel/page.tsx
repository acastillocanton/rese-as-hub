import Link from "next/link";
import { Users } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { SyncNowButton } from "@/components/ui/SyncNowButton";

// Forzamos render dinámico: la página usa `new Date()` para proyección ETA
// y deltas vs mes pasado. Si Next cachea la respuesta, los relativos
// quedan stale.
export const dynamic = "force-dynamic";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Ring } from "@/components/charts/Ring";
import { ComingSoon } from "@/components/ui/ComingSoon";
import { RangePicker } from "@/components/ui/RangePicker";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  parseRange,
  defaultShortcuts,
  isFullNaturalMonth,
  lastMonthRange,
  type DateRange,
} from "@/lib/date-range";
import { CopyLinkButton } from "./CopyLinkButton";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb } from "@/lib/branding";

type PanelData = {
  name: string;
  slug: string;
  reviews: number;
  goal: number;
  /** Reseñas del periodo natural anterior. null si el rango actual no es un
   *  mes natural completo y la comparativa pierde sentido. */
  prevReviews: number | null;
  links: number;
  avgRating: number | null;
};

type PanelSearchParams = Promise<{ from?: string; to?: string }>;

const DEMO_DATA: PanelData = {
  name: "Mateo Salgado",
  slug: "mateo-salgado",
  reviews: 74,
  goal: 80,
  prevReviews: 65,
  links: 96,
  avgRating: 4.8,
};

async function loadPanelData(range: DateRange): Promise<PanelData> {
  if (!isSupabaseConfigured()) return DEMO_DATA;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEMO_DATA;

  const profileRes = await supabase
    .from("profiles")
    .select("full_name, slug, monthly_goal")
    .eq("id", user.id)
    .maybeSingle<{ full_name: string; slug: string; monthly_goal: number }>();

  if (!profileRes.data) return DEMO_DATA;

  // La pill "vs. periodo anterior" solo aparece cuando el rango activo es un
  // mes natural completo. Para custom queda como null y el render la oculta.
  const isMonth = isFullNaturalMonth(range);
  const prev = isMonth
    ? lastMonthRange(parseFromIso(range.from))
    : null;

  const baseQueries = [
    supabase
      .from("reviews")
      .select("rating", { count: "exact" })
      .eq("sales_id", user.id)
      .is("removed_at", null)
      .in("match_state", ["counted", "pending"])
      .gte("google_created_at", range.startIso)
      .lt("google_created_at", range.endIso),
    supabase
      .from("share_links")
      .select("id", { count: "exact", head: true })
      .eq("sales_id", user.id)
      .gte("opened_at", range.startIso)
      .lt("opened_at", range.endIso),
  ] as const;

  const prevQuery = prev
    ? supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("sales_id", user.id)
        .is("removed_at", null)
        .in("match_state", ["counted", "pending"])
        .gte("google_created_at", prev.startIso)
        .lt("google_created_at", prev.endIso)
    : null;

  const [reviewsRange, links, reviewsPrev] = await Promise.all([
    baseQueries[0],
    baseQueries[1],
    prevQuery ?? Promise.resolve(null),
  ]);

  const ratings = (reviewsRange.data ?? []) as { rating: number }[];
  const avgRating =
    ratings.length === 0
      ? null
      : ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

  return {
    name: profileRes.data.full_name,
    slug: profileRes.data.slug,
    reviews: reviewsRange.count ?? 0,
    prevReviews: reviewsPrev ? reviewsPrev.count ?? 0 : null,
    links: links.count ?? 0,
    goal: profileRes.data.monthly_goal,
    avgRating,
  };
}

function parseFromIso(ymd: string): Date {
  const parts = ymd.split("-").map(Number);
  return new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

function formatRating(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(1).replace(".", ",");
}

function deltaPill(current: number, previous: number | null) {
  if (previous === null) return null;
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  if (diff === 0) return <Pill withDot>=0 vs. mes pasado</Pill>;
  const sign = diff > 0 ? "+" : "";
  return (
    <Pill tone={diff > 0 ? "ok" : "warn"} withDot>
      {sign}
      {diff} vs. mes pasado
    </Pill>
  );
}

function projection({
  reviews,
  goal,
  now,
}: {
  reviews: number;
  goal: number;
  now: Date;
}): { remaining: number; daysLeft: number; etaLabel: string | null } {
  const remaining = Math.max(goal - reviews, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysLeft = Math.max(
    Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    0,
  );
  const daysSoFar = now.getDate();
  const ratePerDay = daysSoFar > 0 ? reviews / daysSoFar : 0;
  if (remaining === 0) {
    return { remaining: 0, daysLeft, etaLabel: "Objetivo cumplido" };
  }
  if (ratePerDay <= 0) {
    return { remaining, daysLeft, etaLabel: null };
  }
  const daysToReach = Math.ceil(remaining / ratePerDay);
  const eta = new Date(now);
  eta.setDate(now.getDate() + daysToReach);
  if (eta > endOfMonth) {
    return { remaining, daysLeft, etaLabel: null };
  }
  const label = eta.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  return { remaining, daysLeft, etaLabel: label };
}

export default async function PanelPage({
  searchParams,
}: {
  searchParams: PanelSearchParams;
}) {
  const params = await searchParams;
  const brand = await getCurrentUserBrand();
  const now = new Date();
  const range = parseRange(params.from, params.to, now);
  const shortcuts = defaultShortcuts(now);
  const isMonth = isFullNaturalMonth(range);
  // La proyección al objetivo solo tiene sentido cuando seguimos dentro del
  // rango activo (es decir, el rango incluye hoy). Para meses pasados o
  // futuros mostramos `reviews / goal` sin ETA.
  const isCurrentPeriod =
    new Date(range.startIso).getTime() <= now.getTime() &&
    now.getTime() < new Date(range.endIso).getTime();

  const data = await loadPanelData(range);
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://reseñahub.es";
  const link = `${appBase.replace(/^https?:\/\//, "")}/c/${data.slug}`;
  const fullUrl = `${appBase}/c/${data.slug}`;

  const conversion = data.links > 0 ? Math.round((data.reviews / data.links) * 100) : null;
  const { remaining, daysLeft, etaLabel } = projection({
    reviews: data.reviews,
    goal: data.goal,
    now,
  });

  // Etiqueta corta para el lead-in: "Llevas en <rango>".
  const periodLabel = isMonth
    ? range.label.split(" ")[0] // "mayo 2026" → "mayo"
    : range.label;

  return (
    <>
      <Topbar
        title="Mi panel"
        subtitle={`Buenos días, ${data.name.split(" ")[0]}`}
        range={null}
        breadcrumb={getBrandBreadcrumb(brand)}
        compact
        right={
          <>
            <SyncNowButton label="Buscar mis reseñas" size="sm" variant="ghost" />
            <RangePicker
              from={range.from}
              to={range.to}
              label={range.label}
              shortcuts={shortcuts}
            />
            <CopyLinkButton url={fullUrl} label="Compartir mi enlace" primary />
          </>
        }
      />

      <div className="m-page-pad" style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
        <Card padding={28}>
          <div
            className="m-grid-hero"
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr",
              gap: 32,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                Llevas en {periodLabel}
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
                  {data.reviews}
                </span>
                <span style={{ fontSize: 16, color: "var(--ink-3)" }}>
                  reseñas verificadas
                </span>
                {deltaPill(data.reviews, data.prevReviews)}
              </div>
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
                  <span style={{ color: "var(--ink-4)" }}>Conversión</span>{" "}
                  <strong style={{ color: "var(--ink)" }}>
                    {conversion === null ? "—" : `${conversion}%`}
                  </strong>
                </span>
                <span>
                  <span style={{ color: "var(--ink-4)" }}>Estrellas</span>{" "}
                  <strong style={{ color: "var(--ink)" }}>
                    {formatRating(data.avgRating)}
                  </strong>
                </span>
                <span>
                  <span style={{ color: "var(--ink-4)" }}>Enlaces enviados</span>{" "}
                  <strong style={{ color: "var(--ink)" }}>{data.links}</strong>
                </span>
              </div>
            </div>

            <div className="m-ring-row" style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <Ring value={data.reviews} max={data.goal} size={140} />
              <div>
                <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Objetivo mensual</div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    marginTop: 4,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {data.reviews} / {data.goal}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12.5,
                    color: "var(--ink-4)",
                    lineHeight: 1.5,
                    maxWidth: 240,
                  }}
                >
                  {!isCurrentPeriod ? (
                    <>
                      Vista del rango {range.label}. La proyección al objetivo solo se calcula sobre el periodo en curso.
                    </>
                  ) : remaining === 0 ? (
                    <>
                      <strong style={{ color: "var(--ok)" }}>Objetivo conseguido.</strong>{" "}
                      Quedan {daysLeft} días para sumar más.
                    </>
                  ) : etaLabel ? (
                    <>
                      Faltan{" "}
                      <strong style={{ color: "var(--ink)" }}>
                        {remaining} reseñas
                      </strong>{" "}
                      en {daysLeft} días. Con tu ritmo actual cierras objetivo el{" "}
                      <strong style={{ color: "var(--ink)" }}>{etaLabel}</strong>.
                    </>
                  ) : (
                    <>
                      Faltan{" "}
                      <strong style={{ color: "var(--ink)" }}>
                        {remaining} reseñas
                      </strong>{" "}
                      en {daysLeft} días. Necesitas acelerar para llegar.
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Card "Mis clientes" — solo mobile (en desktop el sidebar ya lo cubre). */}
        <div className="m-mobile-only" style={{ marginTop: 16 }}>
          <Link
            href="/clientes"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 18px",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 14,
              textDecoration: "none",
              color: "var(--ink)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--surface-2)",
                display: "grid",
                placeItems: "center",
                color: "var(--ink-2)",
                flexShrink: 0,
              }}
            >
              <Users size={20} strokeWidth={1.75} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
                Mis clientes
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-4)", marginTop: 2 }}>
                Da de alta antes de pedir una reseña
              </div>
            </div>
            <span aria-hidden="true" style={{ color: "var(--ink-4)", fontSize: 18 }}>
              ›
            </span>
          </Link>
        </div>

        <div style={{ marginTop: 16 }}>
          <Card padding={24}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                  Tu enlace personal
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    marginTop: 4,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Para QR impreso o enlace genérico
                </div>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 12.5,
                    color: "var(--ink-4)",
                    lineHeight: 1.55,
                    maxWidth: 540,
                  }}
                >
                  Si vas a enviárselo a un cliente concreto, da de alta su nombre en{" "}
                  <strong style={{ color: "var(--ink-3)" }}>Mis clientes</strong>: el
                  enlace personalizado mejora la atribución automática.
                </p>
              </div>
              <Pill tone="ok" withDot>
                Activo
              </Pill>
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  padding: "14px 14px",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 10,
                  background: "var(--surface-2)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13.5,
                    color: "var(--ink-2)",
                    wordBreak: "break-all",
                    minWidth: 0,
                    flex: "1 1 200px",
                  }}
                >
                  {link}
                </span>
                <CopyLinkButton url={fullUrl} label="Copiar" />
              </div>
              <div style={{ marginTop: 12 }}>
                <Link
                  href="/clientes"
                  style={{
                    display: "inline-block",
                    padding: "7px 12px",
                    border: "1px solid var(--line-strong)",
                    background: "var(--ink)",
                    color: "#fff",
                    borderRadius: 9,
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  Generar enlace por cliente →
                </Link>
              </div>
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 16 }}>
          <ComingSoon
            title="Histórico, ranking e insignias"
            description="Próximamente: tu evolución mensual con barras, las últimas reseñas verificadas, tu posición en el ranking del equipo y las insignias conseguidas."
          />
        </div>
      </div>
    </>
  );
}
