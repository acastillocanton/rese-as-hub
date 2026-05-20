import { Card } from "@/components/ui/Card";

type Params = Promise<{ token: string }>;

export default async function AcceptInvitePage({ params }: { params: Params }) {
  const { token } = await params;
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <Card padding={28} style={{ maxWidth: 460, width: "100%" }}>
        <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
          Aceptar invitación
        </div>
        <h1
          style={{
            margin: "4px 0 12px",
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.025em",
          }}
        >
          Token: <span style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{token}</span>
        </h1>
        <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13.5, lineHeight: 1.55 }}>
          En construcción: aquí completarás tu alta como comercial (nombre, teléfono, foto)
          tras pulsar el enlace de invitación que recibiste por email.
        </p>
      </Card>
    </main>
  );
}
