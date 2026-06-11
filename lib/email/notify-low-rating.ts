import "server-only";
import { sendEmail } from "./brevo";
import { getBrandEmailLogo, getBrandLabel } from "@/lib/branding";
import { buildGoogleReviewUrl } from "@/lib/google/review-url";
import type { Brand, MatchState } from "@/lib/supabase/types";

/**
 * Alerta temprana por reseña con rating bajo (≤2★) — admin + manager +
 * (si counted/pending) director responsable + sales atribuido.
 *
 * Sigue el patrón visual de `notify-new-review.ts` pero con tono de
 * incidente: ⚠️ en el subject, header con borde naranja, dos CTAs
 * (Verificación + Google).
 *
 * Multi-destinatario vía BCC para no exponer la lista de stakeholders
 * unos a otros (admin no debería ver el email del comercial en el "To"
 * de su propio email). `sendEmail` de brevo.ts acepta `bcc`.
 */

export type LowRatingNotificationInput = {
  /** 1 o 2 — el caller ya filtró con isLowRating. */
  rating: number;
  authorName: string;
  reviewText: string | null;
  locationName: string;
  matchState: MatchState;
  /** Comercial atribuido (si counted/pending). */
  salesName: string | null;
  /** Cliente asociado (si counted con client_id). */
  clientName: string | null;
  /** UUID de la reseña — para deep-link a verificación. */
  reviewId: string;
  /** place_id de la ficha — para CTA "Ver en Google". Si null, omitir. */
  placeId: string | null;
  /** Deep-link a la reseña concreta (§4.54). En la alerta de una reseña
   *  recién entrada suele ser null (el enriquecimiento corre después); el
   *  CTA cae a la lista de la ficha. Si llega (p.ej. re-alerta de una edición
   *  ya enriquecida) aterriza en la reseña exacta. */
  mapsUrl?: string | null;
  appBase: string;
  brand: Brand;
  /** Lista de emails (ya deduplicada por resolveLowRatingRecipients).
   *  Se envían como BCC para no exponer la lista. */
  to: string[];
};

function ratingStars(n: number): string {
  return "★".repeat(Math.max(0, Math.min(5, n))) + "☆".repeat(Math.max(0, 5 - n));
}

function matchStateLabel(s: MatchState): string {
  if (s === "counted") return "Atribuida automáticamente";
  if (s === "pending") return "Pendiente de verificación";
  return "Sin atribuir";
}

export async function notifyLowRating(input: LowRatingNotificationInput) {
  if (input.to.length === 0) {
    return { ok: false as const, skipped: true, reason: "no_recipients" as const };
  }
  const subject = `⚠️ Reseña ${input.rating}★ recibida — ${input.locationName}`;
  const verificationUrl = `${input.appBase}/resenas/verificacion`;
  const googleUrl = buildGoogleReviewUrl({ mapsUrl: input.mapsUrl, placeId: input.placeId });

  const html = renderHtml(input, verificationUrl, googleUrl);
  const text = renderText(input, verificationUrl, googleUrl);

  // BCC para no exponer destinatarios entre sí. El "to" del email va
  // al FROM (Brevo lo permite — el remitente como receptor "fantasma").
  return sendEmail({
    to: process.env.BREVO_FROM_EMAIL ?? input.to[0]!,
    bcc: input.to,
    subject,
    html,
    text,
  });
}

function renderText(
  input: LowRatingNotificationInput,
  verificationUrl: string,
  googleUrl: string | null,
): string {
  return [
    `⚠️ Reseña con rating bajo recibida en ReseñaHub.`,
    "",
    `Valoración: ${ratingStars(input.rating)} (${input.rating}/5)`,
    `Ficha: ${input.locationName}`,
    `Autor en Google: ${input.authorName}`,
    input.salesName ? `Comercial atribuido: ${input.salesName}` : null,
    input.clientName ? `Cliente asociado: ${input.clientName}` : null,
    `Estado matching: ${matchStateLabel(input.matchState)}`,
    "",
    input.reviewText ? `«${input.reviewText}»` : "(Sin texto)",
    "",
    `Verificación: ${verificationUrl}`,
    googleUrl ? `Ver en Google: ${googleUrl}` : null,
    "",
    `ReseñaHub · ${getBrandLabel(input.brand)}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(
  input: LowRatingNotificationInput,
  verificationUrl: string,
  googleUrl: string | null,
): string {
  const safeText = escapeHtml(input.reviewText ?? "");
  const safeAuthor = escapeHtml(input.authorName);
  const safeLocation = escapeHtml(input.locationName);
  const safeSales = input.salesName ? escapeHtml(input.salesName) : null;
  const safeClient = input.clientName ? escapeHtml(input.clientName) : null;
  const safeMatchState = escapeHtml(matchStateLabel(input.matchState));
  const logo = getBrandEmailLogo(input.brand);
  const logoHtml = logo.url
    ? `<a href="${logo.linkHref}" style="text-decoration:none;border:0;outline:none;"><img src="${logo.url}" alt="${escapeHtml(logo.alt)}" width="200" style="width:200px;max-width:60%;height:auto;display:block;border:0;outline:none;text-decoration:none;"></a>`
    : `<div style="font-size:18px;font-weight:600;letter-spacing:-0.02em;color:#1a1a1a;">${escapeHtml(logo.alt)}</div>`;
  const brandLabel = escapeHtml(getBrandLabel(input.brand));
  const starsHtml = Array.from({ length: 5 })
    .map(
      (_, i) =>
        `<span style="color:${i < input.rating ? "#b35900" : "#D6D6D9"};font-size:20px;letter-spacing:1px;">★</span>`,
    )
    .join("");

  const googleCtaHtml = googleUrl
    ? `<tr><td style="border-radius:8px;background:#ffffff;border:1px solid #e9e4d8;">
        <a href="${googleUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;font-size:13.5px;font-weight:500;color:#1a1a1a;text-decoration:none;border-radius:8px;letter-spacing:-0.005em;">Ver en Google ↗</a>
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Reseña con rating bajo</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f5f3ee;">${safeAuthor} ha dejado una reseña de ${input.rating} estrellas en ${safeLocation}.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f3ee;">
    <tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px;max-width:100%;">
        <tr><td style="padding:0 8px 28px 8px;">
          ${logoHtml}
          <div style="margin-top:18px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#b35900;font-weight:700;">⚠️ Alerta · Rating bajo</div>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #f0d4a8;border-radius:12px;padding:36px 40px;">
          <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.015em;color:#111111;">Reseña ${input.rating}★ recibida en ${safeLocation}</h1>
          <p style="margin:0 0 22px 0;font-size:14.5px;line-height:1.6;color:#555555;">Una reseña con valoración baja requiere revisión rápida. Considera responder al cliente desde Google y coordinar con el comercial responsable.</p>

          <div style="padding:18px 20px;background:#fdf6ec;border:1px solid #f0d4a8;border-radius:10px;">
            <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#a8a294;font-weight:600;">Detalle</div>
            <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
              <div style="font-weight:600;font-size:15px;color:#1a1a1a;">${safeAuthor}</div>
              <div style="margin-left:auto;">${starsHtml}</div>
            </div>
            <div style="margin-top:6px;font-size:12.5px;color:#8a8478;">Ficha: <span style="color:#1a1a1a;font-weight:500;">${safeLocation}</span></div>
            ${safeSales ? `<div style="margin-top:4px;font-size:12.5px;color:#8a8478;">Comercial atribuido: <span style="color:#1a1a1a;font-weight:500;">${safeSales}</span></div>` : ""}
            ${safeClient ? `<div style="margin-top:4px;font-size:12.5px;color:#8a8478;">Cliente asociado: <span style="color:#1a1a1a;font-weight:500;">${safeClient}</span></div>` : ""}
            <div style="margin-top:4px;font-size:12.5px;color:#8a8478;">Estado matching: <span style="color:#1a1a1a;font-weight:500;">${safeMatchState}</span></div>
            ${safeText ? `<p style="margin:14px 0 0;font-size:14px;line-height:1.55;color:#333333;font-style:italic;">«${safeText}»</p>` : `<p style="margin:14px 0 0;font-size:13px;color:#a8a294;font-style:italic;">(El cliente no dejó texto, solo la valoración.)</p>`}
          </div>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
            <tr><td style="border-radius:8px;background:#111111;padding-right:8px;">
              <a href="${verificationUrl}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:-0.005em;">Ir a verificación →</a>
            </td></tr>
            ${googleCtaHtml}
          </table>
        </td></tr>
        <tr><td style="padding:24px 8px 0 8px;font-size:11.5px;line-height:1.6;color:#a8a294;">
          Recibes este correo porque tu rol (admin / gestor / responsable / comercial atribuido) recibe alertas por reseñas con rating bajo. Si quieres que dejen de llegar, contacta con admin.
          <br><br>
          ReseñaHub · ${brandLabel}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
