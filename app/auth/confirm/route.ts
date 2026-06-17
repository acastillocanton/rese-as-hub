import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSafeNext } from "@/lib/url-validation";

/**
 * HEAD handler explícito. Sin esto, Next.js auto-genera HEAD a partir del GET
 * — incluyendo ejecutar el handler completo solo para "calcular los headers".
 * Eso hace que email scanners (Microsoft Safe Links, antivirus, link-preview)
 * que hacen HEAD al recibir el email consuman el token OTP antes de que el
 * usuario pulse, y al pulsar después salta "otp_expired".
 * Aquí devolvemos 200 vacío sin tocar Supabase.
 */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

// Solo los tipos OTP que la app emite de verdad (§4.1): magic-link de login
// (`type=email`), reenvío de acceso (`type=magiclink`) e invitación
// (`type=invite`). NO admitimos recovery/signup/email_change — no se generan en
// ningún flujo, así que aceptarlos solo ampliaría la superficie. Auditoría 2026-06-17.
const ALLOWED_TYPES = new Set(["magiclink", "invite", "email"]);

type EmailOtpType = "magiclink" | "invite" | "email";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const rawNext = url.searchParams.get("next");
  const safeNext = isSafeNext(rawNext) ? (rawNext as string) : "/";

  const loginUrl = new URL("/login", url.origin);

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type)) {
    loginUrl.searchParams.set("error", "invalid-link");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  if (error) {
    console.error("[auth/confirm] verifyOtp failed:", error);
    loginUrl.searchParams.set("error", "verify-failed");
    return NextResponse.redirect(loginUrl);
  }

  // First successful auth → flip status invited → active. Paused stays paused
  // (it's a deliberate admin action), active stays active. RLS policy
  // `profiles_self_update` permits the user to update their own row as long
  // as `role` doesn't change, which we're not touching here.
  if (data.user) {
    await supabase
      .from("profiles")
      .update({ status: "active" } as never)
      .eq("id", data.user.id)
      .eq("status", "invited");
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
