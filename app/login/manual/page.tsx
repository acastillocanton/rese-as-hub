import { Card } from "@/components/ui/Card";
import { ManualLoginClient } from "./ManualLoginClient";

type SearchParams = Promise<{ token?: string }>;

export default async function ManualLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { token } = await searchParams;
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
      <Card padding={28} style={{ maxWidth: 420, width: "100%" }}>
        <ManualLoginClient tokenHash={token ?? null} />
      </Card>
    </main>
  );
}
