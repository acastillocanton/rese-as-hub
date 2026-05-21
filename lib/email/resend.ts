import "server-only";

/**
 * Thin wrapper para la API de Resend (https://resend.com/docs/api-reference).
 * Sin SDK: usa fetch directamente para evitar añadir una dependencia.
 *
 * Degrada gracefully si RESEND_API_KEY no está configurada: devuelve
 * `{ ok: false, skipped: true }` y logea un warning. Esto permite que la
 * notificación esté integrada en el cron sin romper en entornos donde
 * todavía no tenemos cuenta de Resend (o no queremos enviar correos).
 *
 * Para producir emails de verdad, el equipo de Inseryal tiene que:
 *   1. Crear cuenta en resend.com.
 *   2. Verificar el dominio (recomendado: reseñahub.es). Mientras no esté
 *      verificado, Resend solo permite enviar desde `onboarding@resend.dev`.
 *   3. Generar API key y meterla en .env.local como RESEND_API_KEY.
 *   4. Opcional: definir RESEND_FROM_EMAIL (default: `ReseñaHub
 *      <notificaciones@reseñahub.es>` una vez verificado el dominio).
 */

const RESEND_API = "https://api.resend.com/emails";

type SendInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

type SendResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; status: number; error: string };

const DEFAULT_FROM =
  process.env.RESEND_FROM_EMAIL ?? "ReseñaHub <onboarding@resend.dev>";

export async function sendEmail(input: SendInput): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[resend] RESEND_API_KEY no configurada — saltando envío de email a",
      input.to,
    );
    return { ok: false, skipped: true, reason: "no_api_key" };
  }

  const body: Record<string, unknown> = {
    from: DEFAULT_FROM,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
  };
  if (input.text) body.text = input.text;
  if (input.replyTo) body.reply_to = input.replyTo;

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        `[resend] envío falló (${res.status}) a ${String(input.to)}: ${errText}`,
      );
      return { ok: false, skipped: false, status: res.status, error: errText };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id ?? "" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[resend] envío crashed:", msg);
    return { ok: false, skipped: false, status: 0, error: msg };
  }
}
