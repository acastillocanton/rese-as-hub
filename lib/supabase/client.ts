import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // El flujo por defecto de @supabase/ssr es PKCE: signInWithOtp genera
      // tokens en el email con prefijo `pkce_` que el handler /auth/confirm
      // (que usa verifyOtp) rechaza con otp_expired. Forzamos implicit/OTP
      // para que los magic-links sean compatibles con la misma plantilla
      // y handler que ya usan invites y "reenviar acceso".
      auth: { flowType: "implicit" },
    },
  );
}
