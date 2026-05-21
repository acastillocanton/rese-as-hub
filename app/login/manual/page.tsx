import { redirect } from "next/navigation";

type SearchParams = Promise<{ token?: string }>;

/**
 * Legacy manual-login URL kept for the operational recipe in CLAUDE.md §4.1.
 * It now just forwards to /auth/confirm, which verifies the token server-side
 * and sets the session cookies via @supabase/ssr.
 */
export default async function ManualLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { token } = await searchParams;
  if (!token) {
    redirect("/login?error=invalid-link");
  }
  redirect(
    `/auth/confirm?token_hash=${encodeURIComponent(token)}&type=magiclink&next=/`,
  );
}
