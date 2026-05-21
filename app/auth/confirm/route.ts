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
