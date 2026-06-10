import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Stars } from "@/components/ui/Stars";
import { GoogleReviewLink } from "@/components/ui/GoogleReviewLink";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb } from "@/lib/branding";
import { getRoleScope } from "@/lib/auth/role-scope";
import { canReplyToReviews } from "@/lib/auth/reply-gating";
import { RangePicker } from "@/components/ui/RangePicker";
import { Pagination } from "@/components/ui/Pagination";
import { parseRange, commissionShortcuts, commissionPeriodRange } from "@/lib/date-range";
import { ReviewReplyComposer } from "./ReviewReplyComposer";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SearchParams = Promise<{
  tab?: string;
  location_id?: string;
  rating_lte?: string;
  page?: string;
  from?: string;
  to?: string;
}>;

type ReviewRow = {
  id: string;
  author_name: string;
  rating: number;
  text: string | null;
  google_created_at: string;
  replied_at: string | null;
  reply_text: string | null;
  reply_via: string | null;
  source: string;
  google_review_id: string;
  location: { id: string; name: string; google_place_id: string | null } | null;
  replier: { full_name: string } | null;
};

type LocationOpt = { id: string; name: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
}

export default async function RespuestasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const brand = await getCurrentUserBrand();

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar
          title="Respuestas"
          subtitle="Modo demo · sin Supabase"
          breadcrumb={getBrandBreadcrumb(brand)}
        />
        <div style={{ padding: "24px 32px" }}>
          <Card>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Configura Supabase para gestionar respuestas.
            </div>
          </Card>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const scope = await getRoleScope(supabase);
  // Solo gestor + admin (defensa en profundidad sobre el middleware).
  if (!canReplyToReviews(scope.role)) redirect("/dashboard");

  const tab: "pending" | "answered" =
    params.tab === "answered" ? "answered" : "pending";
  const locationId =
    params.location_id && UUID_RE.test(params.location_id)
      ? params.location_id
      : null;
  const ratingLteRaw = params.rating_lte ? Number(params.rating_lte) : NaN;
  const ratingLte =
    Number.isInteger(ratingLteRaw) && ratingLteRaw >= 1 && ratingLteRaw <= 5
      ? ratingLteRaw
      : null;

  // Paginación: 1-based, clamp >= 1.
  const pageRaw = params.page ? Number(params.page) : 1;
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const offset = (page - 1) * PAGE_SIZE;

  // Rango de fechas SOLO en "Respondidas" (filtra por replied_at). Mismo patrón
  // que /manager/resenas: fallback al periodo de comisión vigente. La pestaña
  // "Sin responder" NO se filtra por fecha (se ven TODAS las pendientes).
  const range =
    tab === "answered"
      ? parseRange(params.from, params.to, new Date(), commissionPeriodRange)
      : null;

  // Cola de pendientes: RECIENTES primero (lo último que ha entrado sube arriba
  // — es lo más urgente de contestar). Respondidas: las más recientes primero.
  let listQuery = supabase
    .from("reviews")
    .select(
      "id, author_name, rating, text, google_created_at, replied_at, reply_text, reply_via, source, google_review_id, location:locations(id, name, google_place_id), replier:profiles!reviews_reply_by_fkey(full_name)",
    )
    .is("removed_at", null);
  listQuery =
    tab === "answered"
      ? listQuery
          .not("replied_at", "is", null)
          .order("replied_at", { ascending: false })
      : listQuery.is("replied_at", null).order("google_created_at", { ascending: false });
  if (locationId) listQuery = listQuery.eq("location_id", locationId);
  if (ratingLte) listQuery = listQuery.lte("rating", ratingLte);
  if (tab === "answered" && range) {
    listQuery = listQuery
      .gte("replied_at", range.startIso)
      .lt("replied_at", range.endIso);
  }
  // Desempate estable (mismo timestamp en inserciones concurrentes) + paginación.
  listQuery = listQuery
    .order("id", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  // Recuento FILTRADO: misma combinación de filtros que la lista activa, para
  // nº de páginas y deshabilitar "Siguiente" en la última. Distinto de los
  // contadores GLOBALES de los chips (pendingCount/answeredCount).
  let filteredCountQuery = supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .is("removed_at", null);
  filteredCountQuery =
    tab === "answered"
      ? filteredCountQuery.not("replied_at", "is", null)
      : filteredCountQuery.is("replied_at", null);
  if (locationId) filteredCountQuery = filteredCountQuery.eq("location_id", locationId);
  if (ratingLte) filteredCountQuery = filteredCountQuery.lte("rating", ratingLte);
  if (tab === "answered" && range) {
    filteredCountQuery = filteredCountQuery
      .gte("replied_at", range.startIso)
      .lt("replied_at", range.endIso);
  }

  const [listRes, pendingCountRes, answeredCountRes, filteredCountRes, locationsRes] =
    await Promise.all([
      listQuery.returns<ReviewRow[]>(),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .is("replied_at", null)
        .is("removed_at", null),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .not("replied_at", "is", null)
        .is("removed_at", null),
      filteredCountQuery,
      supabase
        .from("locations")
        .select("id, name")
        .order("name")
        .returns<LocationOpt[]>(),
    ]);

  const reviews = listRes.data ?? [];
  const pendingCount = pendingCountRes.count ?? 0;
  const answeredCount = answeredCountRes.count ?? 0;
  const filteredTotal = filteredCountRes.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const locations = locationsRes.data ?? [];

  // from/to del rango activo (solo answered) — para arrastrar en los links.
  const rangeFrom = tab === "answered" && range ? range.from : null;
  const rangeTo = tab === "answered" && range ? range.to : null;

  return (
    <>
      <Topbar
        title="Respuestas"
        subtitle="Responde las reseñas de Google en todas las fichas"
        range={
          tab === "pending"
            ? `${pendingCount} sin responder`
            : `${answeredCount} respondidas`
        }
        right={
          tab === "answered" && range ? (
            <RangePicker
              from={range.from}
              to={range.to}
              label={range.label}
              shortcuts={commissionShortcuts()}
              resetParams={["page"]}
            />
          ) : null
        }
        breadcrumb={getBrandBreadcrumb(brand)}
        compact
      />

      <div
        className="m-page-pad"
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
          <div style={sectionLabel}>Cómo responder</div>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13,
              color: "var(--ink-3)",
              lineHeight: 1.55,
              maxWidth: 680,
            }}
          >
            Redacta la respuesta (puedes usar emojis). En las reseñas nuevas
            verás <strong>Publicar en Google</strong>: un solo clic la guarda
            aquí y la publica directamente en la reseña. En las reseñas
            antiguas (importadas antes), usa <strong>Copiar texto</strong> +{" "}
            <strong>Responder en Google</strong> para pegarla en tu panel de
            propietario, y al volver marca la reseña como{" "}
            <strong>respondida</strong>. Si respondes una reseña directamente en
            Google, también saldrá sola de esta cola.
          </p>
        </Card>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <FilterChip
            href={buildHref({ tab: "pending", locationId, ratingLte })}
            label={`Sin responder (${pendingCount})`}
            active={tab === "pending"}
            tone="warn"
          />
          <FilterChip
            href={buildHref({ tab: "answered", locationId, ratingLte, from: rangeFrom, to: rangeTo })}
            label={`Respondidas (${answeredCount})`}
            active={tab === "answered"}
            tone="neutral"
          />
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <FilterChip
              href={buildHref({ tab, locationId, ratingLte: ratingLte ? null : 2, from: rangeFrom, to: rangeTo })}
              label="Solo ≤2★"
              active={ratingLte === 2}
              tone="neutral"
            />
            {locations.length > 1 &&
              (locationId ? (
                <FilterChip
                  href={buildHref({ tab, locationId: null, ratingLte, from: rangeFrom, to: rangeTo })}
                  label={`Ficha: ${locations.find((l) => l.id === locationId)?.name ?? "—"} ✕`}
                  active
                  tone="neutral"
                />
              ) : null)}
          </div>
        </div>

        {locations.length > 1 && !locationId && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {locations.map((l) => (
              <Link
                key={l.id}
                href={buildHref({ tab, locationId: l.id, ratingLte, from: rangeFrom, to: rangeTo })}
                style={{
                  fontSize: 11.5,
                  padding: "4px 9px",
                  borderRadius: 7,
                  textDecoration: "none",
                  color: "var(--ink-3)",
                  border: "1px solid var(--line)",
                  background: "var(--surface)",
                }}
              >
                {l.name}
              </Link>
            ))}
          </div>
        )}

        {reviews.length === 0 ? (
          <Card padding={32}>
            <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
              {tab === "pending" ? "Cola vacía" : "Sin respondidas"}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                marginTop: 4,
                letterSpacing: "-0.02em",
              }}
            >
              {tab === "pending"
                ? "Todo respondido por aquí"
                : "Todavía no hay respuestas"}
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
              {tab === "pending"
                ? "No quedan reseñas sin responder con los filtros actuales. Cuando entren reseñas nuevas aparecerán aquí."
                : "En cuanto marques una reseña como respondida, aparecerá en esta pestaña."}
            </p>
          </Card>
        ) : (
          reviews.map((r) => (
            <Card key={r.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <Stars value={r.rating} size={12} />
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.author_name}</span>
                    <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                      {r.location?.name ?? "—"} · {fmtDateTime(r.google_created_at)}
                    </span>
                    <GoogleReviewLink placeId={r.location?.google_place_id} variant="compact" />
                  </div>
                  {r.text && (
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13,
                        lineHeight: 1.55,
                        color: "var(--ink-2)",
                      }}
                    >
                      {r.text}
                    </p>
                  )}
                </div>
              </div>
              <ReviewReplyComposer
                reviewId={r.id}
                placeId={r.location?.google_place_id}
                replied={r.replied_at !== null}
                initialText={r.reply_text ?? ""}
                repliedAt={r.replied_at}
                replierName={r.replier?.full_name ?? null}
                replyVia={r.reply_via}
                canPublishApi={
                  r.source === "business_profile" &&
                  !r.google_review_id.startsWith("places:")
                }
              />
            </Card>
          ))
        )}

        {filteredTotal > 0 && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={filteredTotal}
            totalPages={totalPages}
            currentParams={{
              tab,
              location_id: locationId,
              rating_lte: ratingLte,
              from: rangeFrom,
              to: rangeTo,
            }}
          />
        )}
      </div>
    </>
  );
}

function buildHref({
  tab,
  locationId,
  ratingLte,
  from,
  to,
}: {
  tab: "pending" | "answered";
  locationId: string | null;
  ratingLte: number | null;
  from?: string | null;
  to?: string | null;
}): string {
  const sp = new URLSearchParams();
  sp.set("tab", tab);
  if (locationId) sp.set("location_id", locationId);
  if (ratingLte) sp.set("rating_lte", String(ratingLte));
  // El rango solo aplica en "answered"; lo arrastramos para no perder el periodo
  // al cambiar de ficha/rating. NUNCA arrastramos `page` → todo filtro resetea a 1.
  if (tab === "answered" && from && to) {
    sp.set("from", from);
    sp.set("to", to);
  }
  return `/resenas/respuestas?${sp.toString()}`;
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
