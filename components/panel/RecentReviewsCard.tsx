import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Stars } from "@/components/ui/Stars";
import { GoogleReviewLink } from "@/components/ui/GoogleReviewLink";

export type RecentReview = {
  id: string;
  author_name: string;
  rating: number;
  google_created_at: string;
  client_name: string | null;
  place_id: string | null;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Card "Últimas reseñas verificadas" del panel del comercial. Lista compacta
 * de las más recientes (counted, no-duplicadas). Reutiliza el patrón de fila
 * de `/panel/resenas` pero recortado (sin texto largo ni pills de match, que
 * aquí no aportan: todas son counted).
 */
export function RecentReviewsCard({ reviews }: { reviews: RecentReview[] }) {
  return (
    <Card padding={0}>
      <div
        style={{
          padding: "20px 22px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
            Tus últimas reseñas
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              marginTop: 4,
              letterSpacing: "-0.02em",
            }}
          >
            Verificadas recientemente
          </div>
        </div>
        {reviews.length > 0 && (
          <Link
            href="/panel/resenas"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--ink-3)",
              textDecoration: "none",
            }}
          >
            Ver todas →
          </Link>
        )}
      </div>

      {reviews.length === 0 ? (
        <div
          style={{
            padding: "8px 22px 24px",
            fontSize: 13.5,
            color: "var(--ink-4)",
            lineHeight: 1.55,
          }}
        >
          Aún no tienes reseñas verificadas. Comparte tu enlace con los clientes
          que has atendido para empezar a sumar.
        </div>
      ) : (
        <div>
          {reviews.map((r) => (
            <div
              key={r.id}
              className="m-review-row"
              style={{
                padding: "14px 22px",
                borderTop: "1px solid var(--line)",
                display: "grid",
                gridTemplateColumns: "32px 1fr auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <Avatar name={r.author_name} size={32} />
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
                    {r.author_name}
                  </span>
                  <Stars value={r.rating} size={13} />
                  <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                    {fmtDate(r.google_created_at)}
                  </span>
                </div>
                {r.client_name && (
                  <div
                    style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 3 }}
                  >
                    Cliente: {r.client_name}
                  </div>
                )}
              </div>
              <GoogleReviewLink placeId={r.place_id} variant="compact" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
