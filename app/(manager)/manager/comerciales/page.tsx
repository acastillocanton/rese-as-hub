import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProfileStatus } from "@/lib/supabase/types";

type SalesRow = {
  id: string;
  full_name: string;
  email: string | null;
  slug: string;
  monthly_goal: number;
  status: ProfileStatus;
  location: { id: string; name: string } | null;
};

export default async function ManagerComercialesPage() {
  let salesList: SalesRow[] = [];
  let dbError: string | null = null;
  let visitsBySales = new Map<string, number>();
  let reviewsBySales = new Map<string, number>();
  let countedBySales = new Map<string, number>();

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ).toISOString();

    const [salesRes, sharesMonthRes, reviewsMonthRes] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, email, slug, monthly_goal, status, location:locations(id, name)",
        )
        .eq("role", "sales")
        .order("full_name"),
      supabase
        .from("share_links")
        .select("sales_id")
        .gte("opened_at", startOfMonth)
        .returns<{ sales_id: string }[]>(),
      supabase
        .from("reviews")
        .select("sales_id, match_state")
        .gte("google_created_at", startOfMonth)
        .returns<{ sales_id: string | null; match_state: string }[]>(),
    ]);

    if (salesRes.error) dbError = salesRes.error.message;
    else salesList = (salesRes.data ?? []) as unknown as SalesRow[];

    for (const s of sharesMonthRes.data ?? []) {
      visitsBySales.set(s.sales_id, (visitsBySales.get(s.sales_id) ?? 0) + 1);
    }
    for (const r of reviewsMonthRes.data ?? []) {
      if (!r.sales_id) continue;
      reviewsBySales.set(r.sales_id, (reviewsBySales.get(r.sales_id) ?? 0) + 1);
      if (r.match_state === "counted") {
        countedBySales.set(r.sales_id, (countedBySales.get(r.sales_id) ?? 0) + 1);
      }
    }
  }

  const teamReviewsCounted = Array.from(countedBySales.values()).reduce(
    (a, b) => a + b,
    0,
  );
  const teamGoal = salesList.reduce((sum, s) => sum + s.monthly_goal, 0);

  return (
    <>
      <Topbar
        title="Comerciales"
        subtitle="Vista solo lectura"
        range={`${salesList.length} en plantilla`}
        breadcrumb="Inseryal"
        right={
          <Link
            href="/manager/export"
            style={{
              padding: "7px 12px",
              background: "var(--ink)",
              color: "#fff",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Exportar Excel
          </Link>
        }
      />

      <div
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {dbError && (
          <Card>
            <div style={{ fontSize: 13, color: "var(--warn)", fontWeight: 500 }}>
              Error al cargar comerciales
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
              }}
            >
              <MiniStat
                label="Comerciales"
                value={salesList.length.toString()}
                sub="en plantilla"
              />
              <MiniStat
                label="Activos"
                value={salesList.filter((s) => s.status === "active").length.toString()}
                sub="con enlace en circulación"
              />
              <MiniStat
                label="Reseñas del mes"
                value={teamReviewsCounted.toString()}
                sub={teamGoal > 0 ? `meta ${teamGoal}` : "sin meta"}
              />
              <MiniStat
                label="Visitas del mes"
                value={Array.from(visitsBySales.values()).reduce((a, b) => a + b, 0).toString()}
                sub="aperturas de enlace"
              />
            </div>

            {salesList.length === 0 ? (
              <Card padding={32}>
                <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                  Sin comerciales todavía
                </div>
                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: 13.5,
                    color: "var(--ink-3)",
                    lineHeight: 1.55,
                  }}
                >
                  El administrador aún no ha invitado a ningún comercial. Cuando
                  lo haga, aparecerán aquí con sus métricas.
                </p>
              </Card>
            ) : (
              <Card padding={0}>
                <div
                  style={{
                    padding: "12px 22px",
                    borderBottom: "1px solid var(--line)",
                    display: "grid",
                    gridTemplateColumns: "2fr 1.4fr 0.7fr 0.7fr 0.7fr 0.9fr",
                    gap: 14,
                    fontSize: 11,
                    color: "var(--ink-4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  <span>Comercial</span>
                  <span>Ficha</span>
                  <span style={{ textAlign: "right" }}>Visitas</span>
                  <span style={{ textAlign: "right" }}>Reseñas</span>
                  <span style={{ textAlign: "right" }}>Meta</span>
                  <span>Estado</span>
                </div>
                {salesList.map((s, i) => {
                  const visits = visitsBySales.get(s.id) ?? 0;
                  const reviews = reviewsBySales.get(s.id) ?? 0;
                  return (
                    <Link
                      key={s.id}
                      href={`/manager/comerciales/${s.slug}`}
                      style={{
                        padding: "14px 22px",
                        borderBottom:
                          i === salesList.length - 1 ? "none" : "1px solid var(--line)",
                        display: "grid",
                        gridTemplateColumns: "2fr 1.4fr 0.7fr 0.7fr 0.7fr 0.9fr",
                        gap: 14,
                        alignItems: "center",
                        fontSize: 13.5,
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}
                      >
                        <Avatar name={s.full_name} size={32} />
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
                            {s.full_name}
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
                              color: "var(--ink-4)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            /c/{s.slug}
                          </div>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--ink-3)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {s.location?.name ?? "—"}
                      </span>
                      <span
                        style={{
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: visits > 0 ? "var(--ink)" : "var(--ink-4)",
                        }}
                      >
                        {visits}
                      </span>
                      <span
                        style={{
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                          color: reviews > 0 ? "var(--ink)" : "var(--ink-4)",
                        }}
                      >
                        {reviews}
                      </span>
                      <span
                        style={{
                          textAlign: "right",
                          fontSize: 13,
                          color: "var(--ink-4)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {s.monthly_goal}
                      </span>
                      <span>
                        <Pill
                          tone={
                            s.status === "active"
                              ? "ok"
                              : s.status === "paused"
                                ? "warn"
                                : "neutral"
                          }
                          withDot
                        >
                          {s.status === "active"
                            ? "Activo"
                            : s.status === "paused"
                              ? "Pausado"
                              : "Invitado"}
                        </Pill>
                      </span>
                    </Link>
                  );
                })}
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
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
