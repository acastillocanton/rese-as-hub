import { z } from "zod";

/**
 * Schema + helpers puros del importador manual de reseñas.
 *
 * Aislado del `actions.ts` ("use server") para poder testearlo en Vitest
 * sin que Next.js se queje de exports no-async en un module-action file.
 */

export const importManualReviewSchema = z.object({
  locationId: z.string().uuid("Selecciona una ficha."),
  authorName: z
    .string()
    .min(1, "Indica el nombre del autor (o 'Anónimo' si Google no lo muestra).")
    .max(200, "Nombre demasiado largo."),
  rating: z.coerce.number().int().min(1, "Mínimo 1 estrella.").max(5, "Máximo 5 estrellas."),
  text: z
    .string()
    .max(5000, "Texto demasiado largo.")
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  googleCreatedAt: z
    .string()
    .min(1, "Indica cuándo se publicó la reseña.")
    .refine((s) => !Number.isNaN(new Date(s).getTime()), "Fecha inválida."),
  forcedSalesId: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .transform((v) => (v && v !== "" ? v : null)),
  forcedClientId: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .transform((v) => (v && v !== "" ? v : null)),
});

export type ImportManualReviewInput = z.input<typeof importManualReviewSchema>;
export type ImportManualReviewData = z.output<typeof importManualReviewSchema>;

/**
 * Detecta nombres genéricos que Google usa cuando el reviewer no tiene
 * perfil público completo. Cuando es true, el matcher pasa a modo
 * temporal-only (ventana corta + un solo candidato cercano).
 */
export function looksAnonymous(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (n === "") return true;
  return (
    n === "anónimo" ||
    n === "anonimo" ||
    n === "un usuario de google" ||
    n === "a google user" ||
    n === "usuario de google"
  );
}

/**
 * Acepta el formato `YYYY-MM-DDTHH:mm` que devuelve `<input type="datetime-local">`
 * (sin zona, asumido como local) y también ISO con zona. En ambos casos
 * normaliza a ISO UTC.
 */
export function toIsoUtc(value: string): string {
  return new Date(value).toISOString();
}
