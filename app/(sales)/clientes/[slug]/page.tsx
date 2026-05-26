import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Stars } from "@/components/ui/Stars";
import { DuplicateBadge } from "@/components/ui/DuplicateBadge";
import { GoogleReviewLink } from "@/components/ui/GoogleReviewLink";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ShareBlock } from "../ShareBlock";
import { DeleteClientButton } from "./DeleteClientButton";
import { ClientEditCard } from "./ClientEditCard";
import { DEFAULT_BRAND } from "@/lib/branding";
import type { Brand } from "@/lib/supabase/types";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type ClientDetail = {
  id: string;
  full_name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  sales_id: string;
};

type SalesProfile = { full_name: string; slug: string; locations: { brand: Brand } | null };

type ReviewRow = {
  id: string;
  author_name: string;
  rating: number;
  text: string | null;
  google_created_at: string;
  match_state: string;
  match_confidence: number;
  is_duplicate: boolean;
  location: { id: string; name: string; google_place_id: string | null } | null;
};

export default async function ClienteDetallePage({ params }: PageProps) {
  const { slug } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Detalle"
          subtitle="Modo demo — sin base de datos"
          breadcrumb="Mis clientes"
          breadcrumbHref="/clientes"
        />
        <div style={{ padding: "24px 32px" }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para ver detalle real del cliente.
            </div>
          </Card>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [profileRes, clientRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, slug, locations:locations(brand)")
      .eq("id", user.id)
      .maybeSingle<SalesProfile>(),
    supabase
      .from("clients")
      .select("id, full_name, slug, email, phone, created_at, sales_id")
      .eq("sales_id", user.id)
      .eq("slug", slug)
      .maybeSingle<ClientDetail>(),
  ]);

  const profile = profileRes.data;
  const client = clientRes.data;
  if (!profile || !client) notFound();

  const [visitsRes, reviewsRes] = await Promise.all([
    supabase
      .from("share_links")
      .select("opened_at, source")
      .eq("client_id", client.id)
      .order("opened_at", { ascending: false })
      .returns<{ opened_at: string; source: string }[]>(),
    supabase
      .from("reviews")
      .select("id, author_name, rating, text, google_created_at, match_state, match_confidence, is_duplicate, location:locations(id, name, google_place_id)")
      .eq("client_id", client.id)
      .is("removed_at", null)
      .order("google_created_at", { ascending: false })
      .returns<ReviewRow[]>(),
  ]);

  const visits = visitsRes.data ?? [];
  const reviews = reviewsRes.data ?? [];
  const firstVisit = visits[visits.length - 1]?.opened_at ?? null;
  const lastVisit = visits[0]?.opened_at ?? null;

  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://reseñahub.es";

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <>
      <Topbar
        title={client.full_name}
        subtitle={`Cliente · Alta ${fmtDate(client.created_at)}`}
        breadcrumb="Mis clientes"
        breadcrumbHref="/clientes"
        range=""
        compact
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/clientes"
              className="m-hide-mobile"
              style={{
                padding: "7px 12px",
                background: "transparent",
                border: "1px solid var(--line-strong)",
                borderRadius: 9,
                fontSize: 13,
                color: "var(--ink-2)",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              ← Todos
            </Link>
            <DeleteClientButton id={client.id} name={client.full_name} />
          </div>
        }
      />

      <div
        className="m-page-pad"
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* Datos + Actividad */}
        <div
          className="m-detail-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)",
            gap: 18,
          }}
        >
          <ClientEditCard
            id={client.id}
            initial={{
              fullName: client.full_name,
              email: client.email,
              phone: client.phone,
            }}
            slug={client.slug}
            joinedAt={client.created_at}
            salesSlug={profile.slug}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <Stat
              label="Visitas al enlace"
              value={visits.length.toString()}
              sub={
                lastVisit
                  ? `Última · ${fmtDateTime(lastVisit)}`
                  : "Aún sin visitas"
              }
            />
            <Stat
              label="Reseñas atribuidas"
              value={reviews.length.toString()}
              sub={
                reviews.length === 0
                  ? "Pendiente de sincronización"
                  : `${reviews.filter((r) => r.match_state === "auto").length} automáticas`
              }
            />
          </div>
        </div>

        {/* Enlace y compartir */}
        <Card>
          <div style={sectionLabel}>Enlace y compartir</div>
          <div style={{ marginTop: 14 }}>
            <ShareBlock
              appBase={appBase}
              salesName={profile.full_name}
              salesSlug={profile.slug}
              clientName={client.full_name}
              clientSlug={client.slug}
              clientEmail={client.email}
              clientPhone={client.phone}
              brand={profile.locations?.brand ?? DEFAULT_BRAND}
            />
          </div>
        </Card>

        {/* Reseñas atribuidas */}
        <Card>
          <div style={sectionLabel}>Reseñas atribuidas</div>
          {reviews.length === 0 ? (
            <div
              style={{
                marginTop: 14,
                padding: "20px 18px",
                border: "1px dashed var(--line-strong)",
                borderRadius: 10,
                background: "var(--surface-2)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: "-0.015em",
                  color: "var(--ink-2)",
                }}
              >
                Aún no hay reseñas para este cliente
              </div>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--ink-3)",
                  maxWidth: 560,
                }}
              >
                Cuando {client.full_name.split(" ")[0]} deje su reseña en Google, la
                veremos aquí en cuanto el sincronizador la recoja (cada 10 min).
                {firstVisit && (
                  <>
                    {" "}
                    Su enlace ya ha sido abierto{" "}
                    <strong style={{ color: "var(--ink)" }}>{visits.length}</strong>{" "}
                    {visits.length === 1 ? "vez" : "veces"} — primera visita el{" "}
                    {fmtDate(firstVisit)}.
                  </>
                )}
              </p>
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {reviews.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: "14px 16px",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    background: "var(--surface)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600, letterSpacing: "-0.005em" }}>
                      {r.author_name}
                    </div>
                    <Stars value={r.rating} />
                  </div>
                  {r.text && (
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13.5,
                        lineHeight: 1.55,
                        color: "var(--ink-2)",
                      }}
                    >
                      {r.text}
                    </p>
                  )}
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      fontSize: 11.5,
                      color: "var(--ink-4)",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{fmtDate(r.google_created_at)}</span>
                    <span>·</span>
                    <span>
                      Match {r.match_state} · confianza {r.match_confidence}%
                    </span>
                    {r.is_duplicate && <DuplicateBadge />}
                    <GoogleReviewLink
                      placeId={r.location?.google_place_id}
                      variant="compact"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--ink-4)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 600,
};

