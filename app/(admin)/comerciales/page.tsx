import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProfileStatus } from "@/lib/supabase/types";
import { InviteSalesButton } from "./InviteSalesButton";
import { InviteManagerButton } from "./InviteManagerButton";
import { DeleteSalesButton } from "./DeleteSalesButton";

type SalesRow = {
  id: string;
  full_name: string;
  email: string | null;
  slug: string;
  monthly_goal: number;
  status: ProfileStatus;
  joined_at: string;
  location: { id: string; name: string } | null;
};

type ManagerRow = {
  id: string;
  full_name: string;
  email: string | null;
  status: ProfileStatus;
};

type LocationOption = { id: string; name: string };

export default async function ComercialesPage() {
  let salesList: SalesRow[] = [];
  let managers: ManagerRow[] = [];
  let locations: LocationOption[] = [];
  let dbError: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [salesRes, managersRes, locRes] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, email, slug, monthly_goal, status, joined_at, location:locations(id, name)",
        )
        .eq("role", "sales")
        .order("joined_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name, email, status")
        .eq("role", "reviews_manager")
        .order("joined_at", { ascending: false })
        .returns<ManagerRow[]>(),
      supabase.from("locations").select("id, name").order("name"),
    ]);

    if (salesRes.error) dbError = salesRes.error.message;
    else salesList = ((salesRes.data ?? []) as unknown) as SalesRow[];

    if (managersRes.data) managers = managersRes.data;
    if (locRes.data) locations = locRes.data as LocationOption[];
  }

  const stats = {
    total: salesList.length,
    active: salesList.filter((s) => s.status === "active").length,
    invited: salesList.filter((s) => s.status === "invited").length,
    paused: salesList.filter((s) => s.status === "paused").length,
  };

  return (
    <>
      <Topbar
        title="Comerciales"
        subtitle="Gestión de comerciales"
        range={`${stats.total} en plantilla`}
        breadcrumb="Inseryal"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <InviteManagerButton />
            <InviteSalesButton locations={locations} />
          </div>
        }
      />

      <div style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
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
                marginBottom: 16,
              }}
            >
              <MiniStat label="Total" value={stats.total} sub="comerciales en plantilla" />
              <MiniStat label="Activos" value={stats.active} sub="con enlace en circulación" />
              <MiniStat label="Invitados" value={stats.invited} sub="pendientes de aceptar" />
              <MiniStat label="Pausados" value={stats.paused} sub="sin actividad reciente" />
            </div>

            {salesList.length === 0 ? (
              <Card padding={32}>
                <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                  Sin comerciales todavía
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    marginTop: 4,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Invita a tu primer comercial
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
                  Necesitarás al menos una ficha creada para asignarle. Cuando
                  invites a alguien, te daremos un enlace de un solo uso que
                  puedes enviarle por WhatsApp o email.
                </p>
                <InviteSalesButton locations={locations} />
              </Card>
            ) : (
              <Card padding={0}>
                <div
                  style={{
                    padding: "12px 22px",
                    borderBottom: "1px solid var(--line)",
                    display: "grid",
                    gridTemplateColumns: "2fr 1.4fr 1fr 0.8fr 0.8fr 100px",
                    gap: 14,
                    fontSize: 11,
                    color: "var(--ink-4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  <span>Comercial</span>
                  <span>Ficha</span>
                  <span>Email</span>
                  <span style={{ textAlign: "right" }}>Objetivo</span>
                  <span>Estado</span>
                  <span></span>
                </div>
                {salesList.map((s, i) => (
                  <SalesRow key={s.id} s={s} last={i === salesList.length - 1} />
                ))}
              </Card>
            )}

            {/* Gestor de reseñas (solo lectura · descarga Excel). */}
            <div style={{ marginTop: 24 }}>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--ink-4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                Gestor de reseñas
              </div>
              {managers.length === 0 ? (
                <Card>
                  <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                    Sin gestor invitado
                  </div>
                  <p
                    style={{
                      margin: "8px 0 14px",
                      fontSize: 13,
                      color: "var(--ink-3)",
                      lineHeight: 1.55,
                      maxWidth: 560,
                    }}
                  >
                    El gestor de reseñas tiene acceso solo lectura al listado
                    global de reseñas y a la descarga del Excel mensual. No ve
                    clientes ni puede editar nada.
                  </p>
                  <InviteManagerButton primary label="+ Invitar gestor" />
                </Card>
              ) : (
                <Card padding={0}>
                  {managers.map((m, i) => (
                    <div
                      key={m.id}
                      style={{
                        padding: "14px 22px",
                        borderBottom:
                          i === managers.length - 1 ? "none" : "1px solid var(--line)",
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr 0.8fr",
                        gap: 14,
                        alignItems: "center",
                        fontSize: 13.5,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, letterSpacing: "-0.005em" }}>
                          {m.full_name}
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--ink-4)",
                            marginTop: 2,
                          }}
                        >
                          Gestor de reseñas · solo lectura
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
                      <span>
                        <Pill
                          tone={
                            m.status === "active"
                              ? "ok"
                              : m.status === "paused"
                                ? "warn"
                                : "neutral"
                          }
                          withDot
                        >
                          {m.status === "active"
                            ? "Activo"
                            : m.status === "paused"
                              ? "Pausado"
                              : "Invitado"}
                        </Pill>
                      </span>
                    </div>
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

function SalesRow({ s, last }: { s: SalesRow; last: boolean }) {
  const tone =
    s.status === "active" ? "ok" : s.status === "paused" ? "warn" : "neutral";
  const label =
    s.status === "active" ? "Activo" : s.status === "paused" ? "Pausado" : "Invitado";
  return (
    <div
      style={{
        padding: "14px 22px",
        borderBottom: last ? "none" : "1px solid var(--line)",
        display: "grid",
        gridTemplateColumns: "2fr 1.4fr 1fr 0.8fr 0.8fr 100px",
        gap: 14,
        alignItems: "center",
        fontSize: 13.5,
      }}
    >
      <Link
        href={`/comerciales/${s.slug}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
          textDecoration: "none",
          color: "inherit",
        }}
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
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            /c/{s.slug}
          </div>
        </div>
      </Link>
      <span
        style={{
          fontSize: 13,
          color: "var(--ink-2)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {s.location?.name ?? "—"}
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
        {s.email ?? "—"}
      </span>
      <span
        style={{
          textAlign: "right",
          fontSize: 13,
          color: "var(--ink-3)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {s.monthly_goal}
      </span>
      <span>
        <Pill tone={tone} withDot>
          {label}
        </Pill>
      </span>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <DeleteSalesButton id={s.id} name={s.full_name} />
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
