import "server-only";
import { sendEmail } from "./resend";

export type NewReviewNotificationInput = {
  /** Email del comercial al que se le atribuye la reseña. */
  salesEmail: string;
  /** Primer nombre o nombre completo del comercial — para el saludo. */
  salesName: string;
  /** Cuántas estrellas dejó el cliente (1..5). */
  rating: number;
  /** Texto que escribió el cliente. */
  reviewText: string | null;
  /** Nombre que mostró el autor en Google. */
  authorName: string;
  /** Nombre del cliente que el matcher asoció (si lo hay). */
  clientFullName: string | null;
  /** Nombre de la ficha de Google. */
  locationName: string | null;
  /** Confianza del matching, 0..100. */
  matchConfidence: number;
  /** Base URL para construir el link al panel del comercial. */
  appBase: string;
};

function ratingStars(n: number): string {
  return "★".repeat(Math.max(0, Math.min(5, n))) + "☆".repeat(Math.max(0, 5 - n));
}

export async function notifyNewReview(input: NewReviewNotificationInput) {
  const firstName = input.salesName.split(" ")[0] || input.salesName;
  const subject = `${ratingStars(input.rating)} Nueva reseña atribuida en ReseñaHub`;
  const panelUrl = `${input.appBase}/panel`;

  const html = renderHtml(input, firstName, panelUrl);
  const text = renderText(input, firstName, panelUrl);

  return sendEmail({
    to: input.salesEmail,
    subject,
    html,
    text,
  });
}

function renderText(
  input: NewReviewNotificationInput,
  firstName: string,
  panelUrl: string,
): string {
  return [
    `Hola, ${firstName}.`,
    "",
    `Acabas de recibir una nueva reseña atribuida en ReseñaHub.`,
    "",
    `Valoración: ${ratingStars(input.rating)} (${input.rating}/5)`,
    `Autor en Google: ${input.authorName}`,
    input.clientFullName ? `Cliente asociado: ${input.clientFullName}` : null,
    input.locationName ? `Ficha: ${input.locationName}` : null,
    `Confianza del matching: ${input.matchConfidence}%`,
    "",
    input.reviewText ? `«${input.reviewText}»` : null,
    "",
    `Ver detalle en tu panel: ${panelUrl}`,
    "",
    "ReseñaHub · Inseryal by Marina d'Or",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function renderHtml(
  input: NewReviewNotificationInput,
  firstName: string,
  panelUrl: string,
): string {
  const safeText = (input.reviewText ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const starsHtml = Array.from({ length: 5 })
    .map(
      (_, i) =>
        `<span style="color:${i < input.rating ? "#1D1D1F" : "#D6D6D9"};font-size:18px;letter-spacing:1px;">★</span>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Nueva reseña atribuida</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f5f3ee;">${input.authorName} acaba de dejarte una reseña de ${input.rating} estrellas.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f3ee;">
    <tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px;max-width:100%;">
        <tr><td style="padding:0 8px 28px 8px;">
          <a href="https://inseryal.es" style="text-decoration:none;border:0;outline:none;">
            <img src="https://inseryal.es/wp-content/uploads/2025/02/logo-Inseryal-by-Marina-dOr.png" alt="Inseryal by Marina d'Or" width="200" style="width:200px;max-width:60%;height:auto;display:block;border:0;outline:none;text-decoration:none;">
          </a>
          <div style="margin-top:18px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a8478;font-weight:600;">Reseña<span style="color:#1a1a1a;">Hub</span> · Notificación</div>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #e9e4d8;border-radius:12px;padding:36px 40px;">
          <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.015em;color:#111111;">¡Tienes una reseña nueva, ${firstName}!</h1>
          <p style="margin:0 0 22px 0;font-size:14.5px;line-height:1.6;color:#555555;">El sincronizador acaba de atribuirte una nueva reseña de Google.</p>

          <div style="padding:18px 20px;background:#f8f6f0;border:1px solid #ece8df;border-radius:10px;">
            <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#a8a294;font-weight:600;">Cliente y valoración</div>
            <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
              <div style="font-weight:600;font-size:15px;color:#1a1a1a;">${input.authorName}</div>
              <div style="margin-left:auto;">${starsHtml}</div>
            </div>
            ${input.clientFullName ? `<div style="margin-top:6px;font-size:12.5px;color:#8a8478;">Cliente asociado: <span style="color:#1a1a1a;font-weight:500;">${input.clientFullName}</span></div>` : ""}
            ${input.locationName ? `<div style="margin-top:4px;font-size:12.5px;color:#8a8478;">Ficha: ${input.locationName}</div>` : ""}
            ${safeText ? `<p style="margin:14px 0 0;font-size:14px;line-height:1.55;color:#333333;font-style:italic;">«${safeText}»</p>` : ""}
            <div style="margin-top:14px;font-size:11.5px;color:#a8a294;">Confianza del matching: ${input.matchConfidence}%</div>
          </div>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
            <tr><td style="border-radius:8px;background:#111111;">
              <a href="${panelUrl}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:-0.005em;">Ver mi panel →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 8px 0 8px;font-size:11.5px;line-height:1.6;color:#a8a294;">
          Recibes este correo porque eres comercial activo en ReseñaHub.
          <br><br>
          ReseñaHub · Inseryal by Marina d'Or
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
