import type { Page } from "@playwright/test";

/**
 * Helper de autenticación E2E.
 *
 * En vez de pasar por el flujo magic-link real (Supabase + Brevo, no
 * practicable en tests), generamos un token con `auth.admin.generateLink`
 * via service-role y entramos por `/login/manual?token=<hashed_token>`
 * (CLAUDE.md §4.2). El handler en `/auth/confirm` materializa la sesión
 * con `verifyOtp({ token_hash, type: 'email' })`.
 *
 * Requiere las env vars NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 * disponibles en el process que corre los tests (típicamente cargadas desde
 * `.env.local` por Next al lanzar `npm run dev`, o exportadas en el shell
 * cuando se usa E2E_BASE_URL contra un entorno remoto).
 */
export async function loginAs(
  page: Page,
  email: string,
  expectedHomePath: "/dashboard" | "/panel",
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "loginAs(): faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno",
    );
  }

  const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!res.ok) {
    throw new Error(
      `loginAs(): generate_link respondió ${res.status} para ${email}`,
    );
  }
  const data = (await res.json()) as { hashed_token?: string };
  if (!data.hashed_token) {
    throw new Error(`loginAs(): generate_link no devolvió hashed_token para ${email}`);
  }

  await page.goto(`/login/manual?token=${data.hashed_token}`);
  await page.waitForURL(`**${expectedHomePath}**`);
}
