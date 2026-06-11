import { z } from "zod";

/**
 * Schemas Zod compartidos por las server actions de comerciales y directores.
 * Viven aquí (módulo SIN "use server") porque un fichero "use server" solo
 * puede exportar funciones async — no podía exportar estos helpers, así que
 * antes estaban duplicados en cada actions.ts.
 */

export const departmentSchema = z.enum([
  "nacional",
  "internacional",
  "castellon",
  "valencia",
]);

export const pauseReasonSchema = z.enum([
  "vacaciones",
  "baja_medica",
  "permiso_laboral",
]);

/**
 * Tarifa de comisión por reseña en € (mig 020). Acepta string del form o
 * number. Reglas:
 *  - vacío / null / undefined → null (tarifa no configurada).
 *  - admite coma decimal ("2,50").
 *  - se redondea a 2 decimales y se acota a [0, 9999].
 *  - una entrada NO vacía que no sea un número válido ≥ 0 → ERROR de validación
 *    (antes se coaccionaba a null en silencio, borrando la tarifa sin avisar).
 */
export const commissionRateSchema = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined) return null;
    const s = typeof v === "number" ? String(v) : v.trim();
    if (s === "") return null;
    const n = Number(s.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La comisión debe ser un número igual o mayor que 0.",
      });
      return z.NEVER;
    }
    return Math.round(Math.min(n, 9999) * 100) / 100;
  });

/**
 * Tope de reseñas BONIFICABLES por periodo (mig 026). Mismo patrón que
 * commissionRateSchema pero ENTERO. Reglas:
 *  - vacío / null / undefined → null (sin tope → paga todas las counted).
 *  - entero ≥ 0; se acota a [0, 9999].
 *  - una entrada NO vacía que no sea un entero válido ≥ 0 → ERROR de validación.
 */
export const commissionCapSchema = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined) return null;
    const s = typeof v === "number" ? String(v) : v.trim();
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El tope de reseñas bonificables debe ser un número entero igual o mayor que 0.",
      });
      return z.NEVER;
    }
    return Math.min(n, 9999);
  });
