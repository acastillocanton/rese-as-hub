import { getBrandLabel } from "@/lib/branding";
import type { Brand } from "@/lib/supabase/types";

/** Plantilla del mensaje que el comercial copia al cliente cuando le manda
 *  el enlace de su cliente (WhatsApp / email / SMS). La marca viene de la
 *  location del comercial. */
export function getDefaultReviewMessageTemplate(brand: Brand): string {
  return `Hola {nombre_cliente}, soy {nombre_comercial} de ${getBrandLabel(brand)}.

¡Gracias por confiar en nosotros! Si tuviste una buena experiencia, ¿te tomarías 30 segundos para dejarnos una reseña?

{url}

¡Mil gracias!`;
}

/** Plantilla del mensaje genérico (sin cliente concreto) — el comercial la
 *  comparte en grupos o con contactos sin haber creado un cliente. */
export function getGenericLinkTemplate(brand: Brand): string {
  return `Hola, soy {nombre_comercial} de ${getBrandLabel(brand)}.

¿Te tomarías 30 segundos para dejarnos una reseña en Google? Significa muchísimo para nosotros.

{url}

¡Gracias!`;
}

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
