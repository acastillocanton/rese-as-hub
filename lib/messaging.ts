export const DEFAULT_REVIEW_MESSAGE_TEMPLATE = `Hola {nombre_cliente}, soy {nombre_comercial} de Marina d'Or.

¡Gracias por confiar en nosotros! Si tuviste una buena experiencia, ¿te tomarías 30 segundos para dejarnos una reseña?

{url}

¡Mil gracias!`;

export const DEFAULT_EMAIL_SUBJECT = "¿Nos dejas una reseña en Google?";

export type MessageVars = {
  nombre_cliente: string;
  nombre_comercial: string;
  url: string;
};

export function renderMessage(template: string, vars: MessageVars): string {
  return template
    .replace(/\{nombre_cliente\}/g, vars.nombre_cliente)
    .replace(/\{nombre_comercial\}/g, vars.nombre_comercial)
    .replace(/\{url\}/g, vars.url);
}

function cleanPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/[^0-9+]/g, "");
}

export function whatsappHref(phone: string | null | undefined, message: string): string {
  return `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(message)}`;
}

export function emailHref(
  email: string | null | undefined,
  subject: string,
  message: string,
): string {
  const qs = new URLSearchParams({ subject, body: message }).toString();
  return `mailto:${email ?? ""}?${qs}`;
}

// `?&body=` works on both iOS (which expects `;body=`) and Android (which
// expects `?body=`); the leading `?&` is the de-facto cross-platform form.
export function smsHref(phone: string | null | undefined, message: string): string {
  return `sms:${cleanPhone(phone)}?&body=${encodeURIComponent(message)}`;
}
