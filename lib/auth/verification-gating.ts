import { z } from "zod";
import type { Role } from "@/lib/supabase/types";

export type VerificationAction =
  | "confirm"
  | "reject"
  | "reassign"
  | "claim"
  | "mark_removed"
  | "restore";

/**
 * Matriz rol × acción en /resenas/verificacion. Función pura para tener
 * defensa en profundidad por encima de RLS.
 *
 *   admin / reviews_manager → todo.
 *   office_director         → todo excepto claim (usa reassign con
 *                              salesId=self porque es DUAL — productor +
 *                              gestor de equipo).
 *   sales                   → solo claim (unmatched → counted con
 *                              sales_id=self; el resto lo gobierna la RLS).
 *
 * El scope (que la reseña pertenezca al equipo del director o a la
 * location del sales) se valida aparte en assertReviewInScope.
 */
export function canPerformAction(
  role: Role | null,
  action: VerificationAction,
): boolean {
  if (role === "admin" || role === "reviews_manager") return true;
  if (role === "office_director") return action !== "claim";
  if (role === "sales") return action === "claim";
  return false;
}

/**
 * Input de "Reclamar" para sales. XOR: o eliges un cliente existente, o
 * pasas un nombre para crear uno nuevo, o ninguno (reclamar sin cliente).
 * Lo que NO se permite es pasar ambos a la vez.
 */
export const claimReviewSchema = z
  .object({
    reviewId: z.string().uuid(),
    clientId: z
      .string()
      .uuid()
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v : null)),
    newClientName: z
      .string()
      .min(2, "Nombre del cliente demasiado corto.")
      .max(120, "Nombre del cliente demasiado largo.")
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  })
  .refine(
    (v) => !(v.clientId && v.newClientName),
    {
      message: "Elige un cliente existente o crea uno nuevo, no ambos.",
      path: ["newClientName"],
    },
  );

export type ClaimReviewInput = z.input<typeof claimReviewSchema>;
export type ClaimReviewParsed = z.output<typeof claimReviewSchema>;
