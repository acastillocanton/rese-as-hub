/**
 * Lightweight guard so the app can boot before Supabase is connected.
 * When env vars are missing we skip auth/db calls and serve demo data instead.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
