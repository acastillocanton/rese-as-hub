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

/* ─── Plantillas por cliente: 3 perfiles base + personalización por comercial ─── */

/** Ids estables de las 3 plantillas que el comercial puede usar al compartir
 *  el enlace de un cliente. Son también las claves de `profiles.message_templates`
 *  (overrides personalizados). Ver migración 019. */
export type MessageTemplateId = "post_visita" | "reavivar" | "breve";

export type MessageTemplateDef = {
  id: MessageTemplateId;
  /** Etiqueta base para las pestañas / el editor (el comercial puede renombrarla). */
  label: string;
  /** Ayuda de una línea: cuándo usar esta plantilla. */
  description: string;
  /** Plantilla base CON placeholders ({nombre_cliente}/{nombre_comercial}/{url}). */
  build: (brand: Brand) => string;
};

/** Override personalizado de una plantilla por el comercial: nombre y/o cuerpo.
 *  Cualquier campo ausente o en blanco → se usa el valor base. */
export type SavedTemplateEntry = { label?: string; body?: string };

/** Versiones personalizadas del comercial, leídas de `profiles.message_templates`,
 *  keyed por MessageTemplateId. */
export type SavedTemplates =
  | Partial<Record<MessageTemplateId, SavedTemplateEntry>>
  | null
  | undefined;

/** Plantilla B — reavivar una visita anterior (herramienta comercial para
 *  recuperar clientes que pasaron por la oficina hace tiempo). */
function buildReavivarTemplate(brand: Brand): string {
  return `Hola {nombre_cliente}, soy {nombre_comercial} de ${getBrandLabel(brand)}.

Hace un tiempo estuviste con nosotros y nos encantaría saber qué tal fue tu experiencia. ¿Te animas a dejarnos una reseña? Solo te llevará 30 segundos:

{url}

¡Te lo agradecemos un montón!`;
}

/** Plantilla C — breve y cercana, para clientes de confianza o WhatsApp rápido. */
function buildBreveTemplate(brand: Brand): string {
  return `¡Hola {nombre_cliente}! Soy {nombre_comercial} de ${getBrandLabel(brand)} 😊

¿Nos echas una mano con una reseña rápida en Google? Significa mucho para nosotros:

{url}

¡Gracias!`;
}

/** Las 3 plantillas base, en el orden en que se muestran. La primera
 *  (`post_visita`) es la histórica y el default al compartir. */
export const MESSAGE_TEMPLATES: MessageTemplateDef[] = [
  {
    id: "post_visita",
    label: "Recién atendido",
    description: "Cliente que acaba de terminar su visita.",
    build: getDefaultReviewMessageTemplate,
  },
  {
    id: "reavivar",
    label: "Reavivar visita",
    description: "Cliente que pasó por la oficina hace tiempo.",
    build: buildReavivarTemplate,
  },
  {
    id: "breve",
    label: "Breve y cercana",
    description: "Mensaje corto e informal, para clientes de confianza.",
    build: buildBreveTemplate,
  },
];

/** Devuelve el CUERPO (CON placeholders) que debe usarse para `id`:
 *  el del comercial si existe y no está en blanco, o el base en caso contrario. */
export function resolveTemplate(
  id: MessageTemplateId,
  brand: Brand,
  overrides: SavedTemplates,
): string {
  const body = overrides?.[id]?.body?.trim();
  if (body) return body;
  const def = MESSAGE_TEMPLATES.find((t) => t.id === id);
  return def ? def.build(brand) : getDefaultReviewMessageTemplate(brand);
}

/** Devuelve el NOMBRE de la plantilla `id` para mostrar en las pestañas/editor:
 *  el renombrado por el comercial si existe y no está en blanco, o el base. */
export function resolveLabel(id: MessageTemplateId, overrides: SavedTemplates): string {
  const label = overrides?.[id]?.label?.trim();
  if (label) return label;
  return MESSAGE_TEMPLATES.find((t) => t.id === id)?.label ?? "Mensaje";
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
