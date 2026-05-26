import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Stars } from "@/components/ui/Stars";
import { Pill } from "@/components/ui/Pill";
import { DuplicateBadge } from "@/components/ui/DuplicateBadge";
import { Avatar } from "@/components/ui/Avatar";
import { RangePicker } from "@/components/ui/RangePicker";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  parseRange,
  defaultShortcuts,
  type DateRange,
} from "@/lib/date-range";

// `new Date()` + rango activo basado en "ahora" → forzamos dinámico.
export const dynamic = "force-dynamic";

type SalesProfile = {
  id: string;
  full_name: string;
  slug: string;
};

type ReviewRow = {
  id: string;
  author_name: string;
  rating: number;
  text: string | null;
  google_created_at: string;
  match_state: string;
  match_confidence: number;
  is_duplicate: boolean;
  client: { full_name: string; slug: string } | null;
  location: { name: string } | null;
};

type ResenasSearchParams = Promise<{ from?: string; to?: string }>;

export default async function MisResenasPage({
  searchParams,
}: {
  searchParams: ResenasSearchParams;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Mis reseñas"
          subtitle="Modo demo — sin base de datos"
          breadcrumb="Mi panel"
          breadcrumbHref="/panel"
          range={null}
        />
        <div style={{ padding: "24px 32px" }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para ver tus reseñas atribuidas reales.
            </div>
          </Card>
        </div>
      </>
    );
  }

  const params = await searchParams;
  const now = new Date();
  const range = parseRange(params.from, params.to, now);
  const shortcuts = defaultShortcuts(now);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profileRes = await supabase
    .from("profiles")
    .select("id, full_name, slug")
    .eq("id", user.id)
    .maybeSingle<SalesProfile>();

  if (!profileRes.data) redirect("/panel");
  const profile = profileRes.data;

  const reviewsRes = await supabase
    .from("reviews")
    .select(
      "id, author_name, rating, text, google_created_at, match_state, match_confidence, is_duplicate, client:clients(full_name, slug), location:locations(name)",
    )
    .eq("sales_id", user.id)
    .is("removed_at", null)
    .gte("google_created_at", range.startIso)
    .lt("google_created_at", range.endIso)
    .order("google_created_at", { ascending: false })
    .returns<ReviewRow[]>();

  const reviews = reviewsRes.data ?? [];

  // KPIs del rango — anti-fraude (mig 015): contamos sólo las NO duplicadas.
  // Las duplicadas siguen apareciendo en el listado con badge "Duplicada".
  const total = reviews.length;
  const counted = reviews.filter(
    (r) => r.match_state === "counted" && !r.is_duplicate,
  ).length;
  const pending = reviews.filter(
    (r) => r.match_state === "pending" && !r.is_duplicate,
  ).length;
  const duplicates = reviews.filter((r) => r.is_duplicate).length;
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;
  const fiveStars = reviews.filter((r) => r.rating === 5).length;
  const fiveStarsPct =
    reviews.length > 0 ? Math.round((fiveStars / reviews.length) * 100) : null;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <>
      <Topbar
        title="Mis reseñas"
        subtitle={`Reseñas atribuidas a ${profile.full_name.split(" ")[0]}`}
        breadcrumb="Mi panel"
        breadcrumbHref="/panel"
        range={null}
        compact
        right={
          <>
            <RangePicker
              from={range.from}
              to={range.to}
              label={range.label}
              shortcuts={shortcuts}
            />
            <Link
              href="/panel"
              className="m-hide-mobile"
              style={{
                padding: "7px 12px",
                border: "1px solid var(--line-strong)",
                borderRadius: 9,
                fontSize: 13,
                color: "var(--ink-2)",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              ← Mi panel
            </Link>
          </>
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
        {/* KPIs del rango */}
        <div
          className="m-stats-4"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
          }}
        >
          <Stat
            label="Reseñas atribuidas"
            value={total.toString()}
            sub={
              total === 0
                ? "Pendiente sincronización"
                : duplicates > 0
                  ? `${counted} contadas · ${pending} por verificar · ${duplicates} duplicadas`
                  : `${counted} contadas · ${pending} por verificar`
            }
          />
          <Stat
            label="Valoración media"
            value={avgRating === null ? "—" : avgRating.toFixed(2).replace(".", ",")}
            sub={avgRating === null ? "Sin datos en el rango" : "Sobre 5 estrellas"}
          />
          <Stat
            label="Excelentes (5★)"
            value={fiveStars.toString()}
            sub={fiveStarsPct === null ? "—" : `${fiveStarsPct}% del total`}
          />
          <Stat
            label="Rango activo"
            value={range.label}
            sub="Cambia con el selector"
          />
        </div>

        {/* Lista de reseñas */}
        <Card padding={0}>
          <div
            style={{
              padding: "18px 22px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: total > 0 ? "1px solid var(--line)" : "none",
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
                Detalle
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  marginTop: 4,
                  letterSpacing: "-0.02em",
                }}
              >
                Listado de reseñas
              </div>
            </div>
            {total > 0 && (
              <Pill withDot tone={pending > 0 ? "warn" : "ok"}>
                {pending > 0 ? `${pending} por verificar` : "Todo verificado"}
              </Pill>
            )}
          </div>

          {total === 0 ? (
            <EmptyState range={range} />
          ) : (
            <div>
              {reviews.map((r) => (
                <ReviewItem key={r.id} review={r} fmtDate={fmtDate} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function ReviewItem({
  review,
  fmtDate,
}: {
  review: ReviewRow;
  fmtDate: (iso: string) => string;
}) {
  return (
    <div
      className="m-review-row"
      style={{
        padding: "18px 22px",
        borderTop: "1px solid var(--line)",
        display: "grid",
        gridTemplateColumns: "32px 1fr auto",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      <Avatar name={review.author_name} size={32} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: 600, letterSpacing: "-0.005em" }}>
            {review.author_name}
          </span>
          <Stars value={review.rating} size={13} />
          <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
            {fmtDate(review.google_created_at)}
          </span>
        </div>
        {review.text && (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "var(--ink-2)",
              whiteSpace: "pre-wrap",
            }}
          >
            {review.text}
          </p>
        )}
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 12,
            fontSize: 11.5,
            color: "var(--ink-4)",
            flexWrap: "wrap",
          }}
        >
          {review.client && (
            <span>
              Cliente:{" "}
              <Link
                href={`/clientes/${review.client.slug}`}
                style={{ color: "var(--ink-3)", textDecoration: "underline" }}
              >
                {review.client.full_name}
              </Link>
            </span>
          )}
          {review.location && <span>Ficha: {review.location.name}</span>}
          <span>
            Match: {matchStateLabel(review.match_state)} · confianza{" "}
            {review.match_confidence}%
          </span>
        </div>
      </div>
      <div
        className="m-review-pill"
        style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}
      >
        <Pill withDot tone={matchStateTone(review.match_state)}>
          {matchStateLabel(review.match_state)}
        </Pill>
        {review.is_duplicate && <DuplicateBadge />}
      </div>
    </div>
  );
}

function matchStateLabel(state: string): string {
  if (state === "counted") return "Contada";
  if (state === "pending") return "Por verificar";
  if (state === "manual") return "Manual";
  if (state === "unmatched") return "Sin atribuir";
  return state;
}

function matchStateTone(state: string): "ok" | "warn" | "neutral" {
  if (state === "counted" || state === "manual") return "ok";
  if (state === "pending") return "warn";
  return "neutral";
}

function EmptyState({ range }: { range: DateRange }) {
  return (
    <div style={{ padding: "32px 28px 36px" }}>
      <div
        style={{
          padding: "28px 28px",
          border: "1px dashed var(--line-strong)",
          borderRadius: 12,
          background: "var(--surface-2)",
          maxWidth: 640,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            display: "inline-flex",
            width: 48,
            height: 48,
            borderRadius: 999,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            color: "var(--ink-3)",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            marginBottom: 14,
          }}
        >
          ★
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          Aún no tienes reseñas atribuidas en {range.label}
        </div>
        <p
          style={{
            margin: "8px auto 0",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--ink-3)",
            maxWidth: 480,
          }}
        >
          En cuanto un cliente deje su reseña en Google y el sincronizador la atribuya a tu nombre, la verás aquí con su valoración, el cliente al que se asocia y la ficha donde se publicó.
        </p>
        <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/panel/enlace"
            style={{
              padding: "8px 14px",
              background: "var(--ink)",
              color: "#fff",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Compartir mi enlace
          </Link>
          <Link
            href="/clientes"
            style={{
              padding: "8px 14px",
              background: "var(--surface)",
              border: "1px solid var(--line-strong)",
              color: "var(--ink)",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Mis clientes
          </Link>
        </div>
      </div>
    </div>
  );
}
