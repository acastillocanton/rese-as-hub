import { Card } from "@/components/ui/Card";
import { CallbackHandler } from "./CallbackHandler";

type SearchParams = Promise<{ next?: string; code?: string }>;

/**
 * The callback page handles two Supabase auth flows:
 *  - PKCE: the URL has `?code=...` and we exchange it server-side (preferred).
 *  - Implicit / hash recovery: the URL has `#access_token=...&refresh_token=...`
 *    in the fragment, which the server can't see. The CallbackHandler client
 *    component reads it from window.location.hash and calls setSession().
 */
export default async function CallbackPage({
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
      <Card padding={28} style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
          Iniciando sesión…
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          Un momento
        </div>
        <CallbackHandler
          code={params.code ?? null}
          next={params.next ?? "/"}
        />
      </Card>
    </main>
  );
}
