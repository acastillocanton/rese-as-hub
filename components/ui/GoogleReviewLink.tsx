import { ExternalLink } from "lucide-react";
import { buildGoogleReviewListUrl } from "@/lib/google/review-url";

/**
 * Enlace a la ficha pública de Google con el panel de reseñas abierto.
 * Devuelve null si la location no tiene `google_place_id` configurado
 * (caso defensivo — las 7 fichas de prod lo tienen).
 *
 * Hoy enlaza a la LISTA de reseñas de la ficha; cuando llegue Business
 * Profile API y tengamos `reviewId` raw podremos deep-linkar a la reseña
 * concreta (ver JSDoc de `buildGoogleReviewListUrl`).
 *
 * Variantes:
 *   • compact (default) — solo icono. Para grid de tabla denso
 *     (/manager/resenas) o headers de cards.
 *   • default — icono + texto "Ver en Google". Para footers de cards
 *     con espacio.
 *
 * Server component-safe: no usa hooks ni event handlers (es un <a>
 * estándar con target=_blank).
 */
export function GoogleReviewLink({
  placeId,
  variant = "compact",
}: {
  placeId: string | null | undefined;
  variant?: "compact" | "default";
}) {
  const href = buildGoogleReviewListUrl(placeId);
  if (!href) return null;

  const isCompact = variant === "compact";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Ver reseña en Google"
      title="Ver en Google"
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
      {!isCompact && <span>Ver en Google</span>}
    </a>
  );
}
