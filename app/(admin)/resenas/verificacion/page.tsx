import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ReviewVerificationRow } from "./ReviewVerificationRow";

type SearchParams = Promise<{ state?: string }>;

type ReviewRow = {
  id: string;
  author_name: string;
  rating: number;
  text: string | null;
  google_created_at: string;
  match_state: string;
  match_confidence: number;
  match_evidence: Record<string, unknown> | null;
  sales: { id: string; full_name: string; slug: string } | null;
  client: { id: string; full_name: string } | null;
  location: { id: string; name: string } | null;
};

export type SalesOption = {
  id: string;
  full_name: string;
  slug: string;
  clients: { id: string; full_name: string }[];
};

export default async function ResenasVerificacionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const stateFilter = params.state === "unmatched" ? "unmatched" : "pending";

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Verificación"
          subtitle="Modo demo · sin Supabase"
          breadcrumb="Inseryal"
        />
        <div style={{ padding: "24px 32px" }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para ver reseñas reales.
            </div>
          </Card>
        </div>
      </>
    );
  }

  const supabase = await createClient();

  const [reviewsRes, pendingCountRes, unmatchedCountRes, salesWithClientsRes] =
    await Promise.all([
      supabase
        .from("reviews")
        .select(
          "id, author_name, rating, text, google_created_at, match_state, match_confidence, match_evidence, sales:profiles!reviews_sales_id_fkey(id, full_name, slug), client:clients(id, full_name), location:locations(id, name)",
        )
        .eq("match_state", stateFilter)
        .order("google_created_at", { ascending: false })
        .returns<ReviewRow[]>(),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("match_state", "pending"),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("match_state", "unmatched"),
      supabase
        .from("profiles")
        .select("id, full_name, slug, clients:clients(id, full_name)")
        .eq("role", "sales")
        .order("full_name")
        .returns<SalesOption[]>(),
    ]);

  const reviews = reviewsRes.data ?? [];
  const pendingCount = pendingCountRes.count ?? 0;
  const unmatchedCount = unmatchedCountRes.count ?? 0;
  const salesOptions = salesWithClientsRes.data ?? [];

  return (
    <>
      <Topbar
        title="Verificación"
        subtitle="Bandeja de matching dudoso"
        range={
          stateFilter === "pending"
            ? `${pendingCount} pendientes`
            : `${unmatchedCount} sin atribuir`
        }
        breadcrumb="Inseryal"
      />

      <div
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <Card>
          <div style={sectionLabel}>Cómo usar esta bandeja</div>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13,
              color: "var(--ink-3)",
              lineHeight: 1.55,
              maxWidth: 640,
            }}
          >
            Las reseñas <strong>Pendientes</strong> tienen una propuesta del matcher
            con confianza entre 40% y 75% — el algoritmo cree saber quién las
            generó pero no se atreve a contabilizar sin tu confirmación. Las{" "}
            <strong>Sin atribuir</strong> no encontraron candidato razonable;
            úsalas para reasignar manualmente si reconoces al cliente.
          </p>
        </Card>

        <div style={{ display: "flex", gap: 8 }}>
          <FilterChip
            href="/resenas/verificacion?state=pending"
            label={`Pendientes (${pendingCount})`}
            active={stateFilter === "pending"}
            tone="warn"
          />
          <FilterChip
            href="/resenas/verificacion?state=unmatched"
            label={`Sin atribuir (${unmatchedCount})`}
            active={stateFilter === "unmatched"}
            tone="neutral"
          />
        </div>

        {reviews.length === 0 ? (
          <Card padding={32}>
            <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
              {stateFilter === "pending" ? "Bandeja vacía" : "Sin reseñas no atribuidas"}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                marginTop: 4,
                letterSpacing: "-0.02em",
              }}
            >
              {stateFilter === "pending"
                ? "Todo en orden por aquí"
                : "Cero reseñas huérfanas"}
            </div>
            <p
              style={{
                margin: "10px 0 0",
                color: "var(--ink-3)",
                fontSize: 13.5,
                lineHeight: 1.55,
                maxWidth: 560,
              }}
            >
              {stateFilter === "pending"
                ? "Cuando el cron sincronice una reseña con confianza intermedia, aparecerá aquí para que decidas. Mientras tanto puedes revisar las reseñas "
                : "El matcher ha encontrado un candidato razonable para todas las reseñas sincronizadas. Si crees que hay alguna mal asignada, revisa la pestaña "}
              <Link
                href={
                  stateFilter === "pending"
                    ? "/resenas/verificacion?state=unmatched"
                    : "/resenas/verificacion?state=pending"
                }
                style={{ color: "var(--ink)" }}
              >
                {stateFilter === "pending" ? "sin atribuir" : "pendientes"}
              </Link>
              .
            </p>
          </Card>
        ) : (
          reviews.map((r) => (
            <ReviewVerificationRow
              key={r.id}
              review={r}
              salesOptions={salesOptions}
            />
          ))
        )}
      </div>
    </>
  );
}

function FilterChip({
  href,
  label,
  active,
  tone,
}: {
  href: string;
  label: string;
  active: boolean;
  tone: "warn" | "neutral";
}) {
  const activeBg = tone === "warn" ? "var(--warn-bg)" : "rgba(0,0,0,0.05)";
  const activeColor = tone === "warn" ? "var(--warn)" : "var(--ink)";
  return (
    <Link
      href={href}
      style={{
        padding: "6px 12px",
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 500,
        textDecoration: "none",
        background: active ? activeBg : "var(--surface)",
        color: active ? activeColor : "var(--ink-3)",
        border: "1px solid var(--line-strong)",
      }}
    >
      {label}
    </Link>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--ink-4)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 600,
};
