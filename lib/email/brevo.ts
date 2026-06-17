import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Thin wrapper para enviar emails transaccionales vía SMTP de Brevo. Usa las
 * mismas credenciales que ya tiene Supabase Auth configurado para mandar los
 * magic-links, así centralizamos todo el correo del producto en un único
 * proveedor.
 *
 * Degrada gracefully si faltan env vars: devuelve `{ ok: false, skipped: true }`
 * y logea un warning, para que el cron de sync no rompa si todavía no hemos
 * configurado el envío en algún entorno.
 *
 * Variables de entorno requeridas para enviar de verdad:
 *   - BREVO_SMTP_USER: login SMTP de Brevo (suele ser un email tipo
 *     <numero>@smtp-brevo.com — lo ves en Brevo Dashboard → SMTP & API).
 *   - BREVO_SMTP_PASS: SMTP key (NO la API key — son cosas distintas;
 *     Brevo te la enseña una sola vez al crearla).
 *   - BREVO_FROM_EMAIL: remitente. Formato `ReseñaHub <notificaciones@dominio>`.
 *     El dominio del email debe estar verificado en Brevo (Senders & IP).
 */

const BREVO_SMTP_HOST = "smtp-relay.brevo.com";
const BREVO_SMTP_PORT = 587;

type SendInput = {
  to: string | string[];
  /** Copia oculta — los destinatarios en `bcc` no se ven entre sí ni
   *  desde el `to`. Útil para alertas multi-stakeholder donde no quieres
   *  exponer el resto de la lista (p. ej. alertas ≤2★). */
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

type SendResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; status: number; error: string };

let cachedTransporter: Transporter | null = null;

function getTransporter(user: string, pass: string): Transporter {
  // Reutilizamos el transporter entre invocaciones para que Nodemailer pueda
  // mantener el pool de conexiones SMTP abiertas (más eficiente que abrir
  // una nueva en cada email).
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: BREVO_SMTP_HOST,
    port: BREVO_SMTP_PORT,
    secure: false, // STARTTLS en 587, no SSL directo
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  });
  return cachedTransporter;
}

export async function sendEmail(input: SendInput): Promise<SendResult> {
  const user = process.env.BREVO_SMTP_USER;
  const pass = process.env.BREVO_SMTP_PASS;
  const from = process.env.BREVO_FROM_EMAIL;

  if (!user || !pass || !from) {
    // No logueamos `input.to` (PII de destinatarios → acaba en logs de Vercel);
    // solo el nº de destinatarios y qué credencial falta. Auditoría 2026-06-17.
    const recipientCount = Array.isArray(input.to) ? input.to.length : 1;
    console.warn(
      `[brevo] credenciales SMTP incompletas — saltando envío a ${recipientCount} destinatario(s) (falta: ${[
        !user && "BREVO_SMTP_USER",
        !pass && "BREVO_SMTP_PASS",
        !from && "BREVO_FROM_EMAIL",
      ]
        .filter(Boolean)
        .join(", ")})`,
    );
    return { ok: false, skipped: true, reason: "missing_smtp_config" };
  }

  try {
    const info = await getTransporter(user, pass).sendMail({
      from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      bcc: input.bcc
        ? Array.isArray(input.bcc)
          ? input.bcc
          : [input.bcc]
        : undefined,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    return { ok: true, id: info.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[brevo] envío falló:", msg);
    return { ok: false, skipped: false, status: 0, error: msg };
  }
}
