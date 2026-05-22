import { redirect } from "next/navigation";

type SearchParams = Promise<{ token?: string }>;

/**
 * Workaround manual de login documentado en CLAUDE.md §4.2. Reenvía el
 * token al handler oficial `/auth/confirm`, que es quien hace `verifyOtp()`
 * y materializa la sesión.
 *
 * El token llega por URL en texto plano → queda en el history del
 * navegador. Por eso este endpoint es solo para emergencias (rate-limit
 * Supabase, debugging) y el admin debería limpiar el history después.
 *
 * Validación defensiva: comprobamos formato razonable antes de redirigir
 * para evitar que un token con basura llegue a verifyOtp y nos cuente
 * como intento de login fallido contra Supabase.
 */
export default async function ManualLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { token } = await searchParams;
  if (!token || !isPlausibleTokenHash(token)) {
    redirect("/login?error=invalid-link");
  }
  redirect(
    `/auth/confirm?token_hash=${encodeURIComponent(token)}&type=magiclink&next=/`,
  );
}

/**
 * Los token_hash que emite Supabase Auth son hex o base64url largos
 * (mínimo ~40 chars en la práctica). Esto NO es validación criptográfica
 * — solo evita propagar inputs absurdamente raros (ataques de inyección
 * de query strings, paths con `..`, etc.).
 */
function isPlausibleTokenHash(t: string): boolean {
  if (t.length < 20 || t.length > 200) return false;
  return /^[A-Za-z0-9_-]+$/.test(t);
}
