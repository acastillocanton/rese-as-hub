import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { Ring } from "@/components/charts/Ring";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function PanelPage() {
  const me = {
    name: "Mateo Salgado",
    slug: "mateo-salgado",
    reviews: 74,
    goal: 80,
  };
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://reseñahub.es";
  const link = `${appBase.replace(/^https?:\/\//, "")}/c/${me.slug}`;

  return (
    <>
      <Topbar
        title="Mi panel"
        subtitle={`Buenos días, ${me.name.split(" ")[0]}`}
        range="Este mes · mayo"
        breadcrumb="Inseryal"
        right={<GhostBtn primary>Compartir mi enlace</GhostBtn>}
      />

      <div style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
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
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Llevas en mayo</div>
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
                  {me.reviews}
                </span>
                <span style={{ fontSize: 16, color: "var(--ink-3)" }}>
                  reseñas verificadas
                </span>
                <Pill tone="ok" withDot>
                  +9 vs. abril
                </Pill>
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
                  <strong style={{ color: "var(--ink)" }}>77%</strong>
                </span>
                <span>
                  <span style={{ color: "var(--ink-4)" }}>Estrellas</span>{" "}
                  <strong style={{ color: "var(--ink)" }}>4,8</strong>
                </span>
                <span>
                  <span style={{ color: "var(--ink-4)" }}>Ranking</span>{" "}
                  <strong style={{ color: "var(--ink)" }}>#2 de 24</strong>
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <Ring value={me.reviews} max={me.goal} size={140} />
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
                  {me.reviews} / {me.goal}
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
                  Faltan <strong style={{ color: "var(--ink)" }}>6 reseñas</strong> en 11
                  días. Con tu ritmo actual cierras objetivo el{" "}
                  <strong style={{ color: "var(--ink)" }}>23 de mayo</strong>.
                </div>
              </div>
            </div>
          </div>
        </Card>

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
                  Para enviar a clientes tras la visita
                </div>
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
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, color: "var(--ink-2)" }}>
                  {link}
                </span>
                <GhostBtn>Copiar</GhostBtn>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <GhostBtn primary>WhatsApp</GhostBtn>
                <GhostBtn>Email</GhostBtn>
                <GhostBtn>SMS</GhostBtn>
                <GhostBtn>QR para imprimir</GhostBtn>
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
