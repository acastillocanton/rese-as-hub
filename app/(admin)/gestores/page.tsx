import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProfileStatus } from "@/lib/supabase/types";
import { InviteManagerButton } from "./InviteManagerButton";
import { DeleteManagerButton } from "./DeleteManagerButton";
import { ResendAccessButton } from "@/components/ui/ResendAccessButton";
import { resendManagerAccess } from "./actions";

type ManagerRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: ProfileStatus;
  joined_at: string;
};

export default async function GestoresPage() {
  let managers: ManagerRow[] = [];
  let dbError: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const res = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, status, joined_at")
      .eq("role", "reviews_manager")
      .order("joined_at", { ascending: false })
      .returns<ManagerRow[]>();
    if (res.error) dbError = res.error.message;
    else managers = res.data ?? [];
  }

  const stats = {
    total: managers.length,
    active: managers.filter((m) => m.status === "active").length,
    invited: managers.filter((m) => m.status === "invited").length,
    paused: managers.filter((m) => m.status === "paused").length,
  };

  return (
    <>
      <Topbar
        title="Gestores de reseñas"
        subtitle="Acceso solo lectura · lista de reseñas y descarga Excel"
        range={`${stats.total} en plantilla`}
        breadcrumb="Inseryal"
        right={<InviteManagerButton primary />}
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
                  El gestor de reseñas tiene acceso solo lectura al listado
                  global de reseñas y a la descarga del Excel mensual. No ve
                  clientes ni puede modificar nada.
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
          </>
        )}
      </div>
    </>
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
            Gestor de reseñas · solo lectura
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
