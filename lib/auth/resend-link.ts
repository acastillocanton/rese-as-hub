import "server-only";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

type Result =
  | { ok: true; link: string; email: string }
  | { ok: false; error: string };

/**
 * Genera un magic-link fresco para un email ya existente. Construye el URL
 * apuntando a /auth/confirm (verifyOtp server-side) — mismo handler que las
 * invitaciones, evitando el flujo PKCE que rompe cuando el destinatario
 * abre el link en otro dispositivo.
 *
 * Pensado para "Reenviar acceso": el admin lo pulsa, copia el link y lo
 * comparte con el comercial/gestor (por WhatsApp, email, etc.). No se envía
 * mail automáticamente.
 */
export async function generateAccessLink(
  email: string,
  nextPath: string,
): Promise<Result> {
  if (!email || !nextPath) return { ok: false, error: "Datos incompletos." };

  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !data?.properties?.hashed_token) {
    console.error("[resend-link] generateLink failed:", error);
    return {
      ok: false,
      error: error?.message ?? "No se pudo generar el enlace.",
    };
  }

  const headerStore = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    `https://${headerStore.get("host") ?? "localhost:3000"}`;

  const link = `${origin}/auth/confirm?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}&type=magiclink&next=${encodeURIComponent(nextPath)}`;

  return { ok: true, link, email };
}
