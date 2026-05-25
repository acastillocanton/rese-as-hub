import type { Brand } from "@/lib/supabase/types";

/**
 * Helpers puros de branding multi-marca. Sirven tanto desde server components
 * como desde client components — no importan `server-only` ni Supabase.
 *
 * Reglas:
 *   • Cada `location` tiene una `brand` (columna en BD, ver migración 014).
 *   • La marca gobierna lo que ve el usuario en UI interna, el mensaje que
 *     copia al cliente, y el logo + firma del email transaccional.
 *   • Los layouts derivan la marca del usuario autenticado vía
 *     `lib/supabase/current-brand.ts`. Si el usuario no tiene location
 *     (admin general, reviews_manager sin oficina), se aplica DEFAULT_BRAND.
 */

/** Marca de fallback cuando no podemos derivarla. Decisión: 'inseryal' es
 *  la marca histórica con mayor número de fichas (5 de 7); es la que ven
 *  los perfiles corporativos no asignados a una oficina concreta. */
export const DEFAULT_BRAND: Brand = "inseryal";

/** Etiqueta larga para subtitle del sidebar y para interpolar en plantillas
 *  ("...de {label}"). */
export function getBrandLabel(brand: Brand): string {
  switch (brand) {
    case "inseryal":
      return "Inseryal by Marina d'Or";
    case "marina_dor_construcciones":
      return "Marina d'Or Construcciones";
  }
}

/** Etiqueta corta para el breadcrumb de la topbar (~120px). Mantenemos
 *  "Inseryal" igual y abreviamos Construcciones a "Marina d'Or"; el
 *  subtitle de la página debajo lo desambigua. */
export function getBrandBreadcrumb(brand: Brand): string {
  switch (brand) {
    case "inseryal":
      return "Inseryal";
    case "marina_dor_construcciones":
      return "Marina d'Or";
  }
}

/** Opciones para selectores de marca en formularios admin (/fichas). */
export const BRAND_OPTIONS: ReadonlyArray<{ value: Brand; label: string }> = [
  { value: "inseryal", label: "Inseryal by Marina d'Or" },
  { value: "marina_dor_construcciones", label: "Marina d'Or Construcciones" },
];

/** Logo del header del email transaccional. Si `url === null`, el render
 *  del email cae a wordmark texto (ver `lib/email/notify-new-review.ts`).
 *  Ambas URLs son recursos públicos servidos desde los dominios oficiales
 *  de cada marca. */
export function getBrandEmailLogo(brand: Brand): {
  url: string | null;
  alt: string;
  linkHref: string;
} {
  switch (brand) {
    case "inseryal":
      return {
        url: "https://inseryal.es/wp-content/uploads/2025/02/logo-Inseryal-by-Marina-dOr.png",
        alt: "Inseryal by Marina d'Or",
        linkHref: "https://inseryal.es",
      };
    case "marina_dor_construcciones":
      return {
        url: "https://marinadorconstrucciones.com/wp-content/uploads/2026/05/logo-marina-dor-construcciones-v2.webp",
        alt: "Marina d'Or Construcciones",
        linkHref: "https://marinadorconstrucciones.com",
      };
  }
}
