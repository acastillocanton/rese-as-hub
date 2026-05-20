import { Card } from "@/components/ui/Card";
import { LoginForm } from "./LoginForm";

type SearchParams = Promise<{ next?: string; error?: string; sent?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
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
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#1D1D1F",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 18,
              margin: "0 auto 12px",
              letterSpacing: "-0.02em",
            }}
          >
            r
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.025em",
            }}
          >
            ReseñaHub
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              color: "var(--ink-3)",
              fontSize: 13,
            }}
          >
            Gestión interna de reseñas
          </p>
        </div>
        <Card padding={22}>
          <LoginForm
            next={params.next}
            error={params.error}
            sent={params.sent === "1"}
          />
        </Card>
        <p
          style={{
            marginTop: 14,
            textAlign: "center",
            color: "var(--ink-4)",
            fontSize: 12,
          }}
        >
          Acceso solo para personal autorizado de Inseryal by Marina d&apos;Or.
        </p>
      </div>
    </main>
  );
}
