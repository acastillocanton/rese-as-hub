import "server-only";
import { sendEmail } from "./brevo";
import { sortFindings, type HealthFinding } from "@/lib/monitoring/health-checks";

/**
 * Email-resumen del chequeo de salud diario. Va SOLO a los admins y SOLO
 * cuando hay al menos un finding (cadencia "solo si hay algo").
 *
 * Es una alerta de SISTEMA, no de comercial: sin branding por marca (a
 * diferencia de notify-low-rating / notify-new-review). Multi-destinatario
 * vía BCC para no exponer la lista de admins entre sí.
 */

export type HealthDigestInput = {
  /** Findings detectados (no vacío — el caller no llama si está vacío). */
  findings: HealthFinding[];
  /** Emails de admins (ya deduplicados). Se mandan como BCC. */
  to: string[];
  appBase: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function severityLabel(s: HealthFinding["severity"]): string {
  return s === "critical" ? "Crítico" : "Aviso";
}

export async function notifyHealthDigest(input: HealthDigestInput) {
  if (input.to.length === 0) {
    return { ok: false as const, skipped: true, reason: "no_recipients" as const };
  }
  const findings = sortFindings(input.findings);
  const criticals = findings.filter((f) => f.severity === "critical").length;
  const subject = `⚠️ ReseñaHub · ${findings.length} ${
    findings.length === 1 ? "incidencia detectada" : "incidencias detectadas"
  }${criticals > 0 ? ` (${criticals} crítica${criticals === 1 ? "" : "s"})` : ""}`;

  const html = renderHtml(findings, input.appBase);
  const text = renderText(findings, input.appBase);

  return sendEmail({
    to: process.env.BREVO_FROM_EMAIL ?? input.to[0]!,
    bcc: input.to,
    subject,
    html,
    text,
  });
}

function renderText(findings: HealthFinding[], appBase: string): string {
  const lines: string[] = [
    "Chequeo de salud de ReseñaHub — se detectaron incidencias:",
    "",
  ];
  for (const f of findings) {
    lines.push(`[${severityLabel(f.severity)}] ${f.title}`);
    lines.push(f.detail);
    if (f.cta) lines.push(`→ ${f.cta.label}: ${appBase}${f.cta.href}`);
    lines.push("");
  }
  lines.push("Recibes este correo porque eres administrador de ReseñaHub.");
  lines.push("Solo se envía cuando hay algo que revisar (chequeo diario).");
  return lines.join("\n");
}

function renderHtml(findings: HealthFinding[], appBase: string): string {
  const cards = findings
    .map((f) => {
      const isCritical = f.severity === "critical";
      const accent = isCritical ? "#b32d2d" : "#b35900";
      const bg = isCritical ? "#fdecec" : "#fdf6ec";
      const border = isCritical ? "#f0bcbc" : "#f0d4a8";
      const ctaHtml = f.cta
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr><td style="border-radius:8px;background:#111111;">
            <a href="${appBase}${escapeHtml(f.cta.href)}" style="display:inline-block;padding:10px 20px;font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:-0.005em;">${escapeHtml(f.cta.label)} →</a>
          </td></tr></table>`
        : "";
      return `<tr><td style="padding:0 0 16px 0;">
        <div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:18px 20px;">
          <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${accent};font-weight:700;">${severityLabel(f.severity)}</div>
          <div style="margin-top:6px;font-size:15.5px;font-weight:700;color:#111111;letter-spacing:-0.01em;">${escapeHtml(f.title)}</div>
          <p style="margin:8px 0 0;font-size:13.5px;line-height:1.55;color:#444444;">${escapeHtml(f.detail)}</p>
          ${ctaHtml}
        </div>
      </td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Chequeo de salud · ReseñaHub</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f3ee;">
    <tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px;max-width:100%;">
        <tr><td style="padding:0 8px 24px 8px;">
          <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#1a1a1a;">ReseñaHub</div>
          <div style="margin-top:14px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#b35900;font-weight:700;">⚠️ Chequeo de salud diario</div>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #ece7db;border-radius:12px;padding:32px 36px;">
          <h1 style="margin:0 0 8px 0;font-size:21px;line-height:1.3;font-weight:700;letter-spacing:-0.015em;color:#111111;">Se detectaron ${findings.length} ${findings.length === 1 ? "incidencia" : "incidencias"}</h1>
          <p style="margin:0 0 22px 0;font-size:14px;line-height:1.6;color:#555555;">Revisión automática del estado del sistema. Cada punto incluye un enlace para actuar.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${cards}
          </table>
        </td></tr>
        <tr><td style="padding:22px 8px 0 8px;font-size:11.5px;line-height:1.6;color:#a8a294;">
          Recibes este correo porque eres administrador de ReseñaHub. Solo se envía cuando el chequeo diario encuentra algo que revisar.
          <br><br>
          ReseñaHub · Alertas de sistema
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
