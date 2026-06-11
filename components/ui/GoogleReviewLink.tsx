import { ExternalLink } from "lucide-react";
import { buildGoogleReviewUrl, isDeepReviewUrl } from "@/lib/google/review-url";

/**
 * Enlace a la reseña en Google. Si la reseña tiene `mapsUrl` (deep-link a la
 * reseña concreta, §4.54) aterriza justo en ella; si no, cae al panel de
 * reseñas de la ficha por `placeId`. Devuelve null si no hay ninguno de los
 * dos (caso defensivo — las 7 fichas de prod tienen place_id).
 *
 * Variantes:
 *   • compact (default) — solo icono. Para grid de tabla denso
 *     (/manager/resenas) o headers de cards.
 *   • default — icono + texto. Para footers de cards con espacio.
 *
 * Server component-safe: no usa hooks ni event handlers (es un <a>
 * estándar con target=_blank).
 */
export function GoogleReviewLink({
  placeId,
  mapsUrl,
  variant = "compact",
}: {
  placeId: string | null | undefined;
  /** Deep-link a la reseña concreta (reviews.google_maps_url). §4.54 */
  mapsUrl?: string | null;
  variant?: "compact" | "default";
}) {
  const href = buildGoogleReviewUrl({ mapsUrl, placeId });
  if (!href) return null;

  const isCompact = variant === "compact";
  const deep = isDeepReviewUrl(href);
  // Con deep-link el copy es preciso ("esta reseña"); sin él, lista de la ficha.
  const label = deep ? "Ver esta reseña en Google" : "Ver reseñas en Google";
  const text = deep ? "Ver reseña" : "Ver en Google";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: isCompact ? 0 : 6,
        padding: isCompact ? "4px 6px" : "4px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        color: "var(--ink-3)",
        textDecoration: "none",
        background: "transparent",
        border: "1px solid var(--line)",
        lineHeight: 1,
      }}
    >
      <ExternalLink
        size={isCompact ? 13 : 12}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      {!isCompact && <span>{text}</span>}
    </a>
  );
}
