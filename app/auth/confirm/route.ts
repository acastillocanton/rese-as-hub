import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSafeNext } from "@/lib/url-validation";

const ALLOWED_TYPES = new Set([
  "magiclink",
  "invite",
  "recovery",
  "email",
  "signup",
  "email_change",
]);

type EmailOtpType =
  | "magiclink"
  | "invite"
  | "recovery"
  | "email"
  | "signup"
  | "email_change";

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
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  if (error) {
    console.error("[auth/confirm] verifyOtp failed:", error);
    loginUrl.searchParams.set("error", "verify-failed");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
