import { defineConfig, devices } from "@playwright/test";

/**
 * Config Playwright para tests E2E del happy path.
 *
 * Auth: aprovechamos el endpoint `/login/manual?token=<hashed_token>` (CLAUDE.md
 * §4.2) — el helper `loginAs()` en `e2e/helpers/auth.ts` genera el token vía
 * Supabase service-role y entra sin pasar por magic-link real.
 *
 * Variables de entorno necesarias en `.env.local` o en el shell:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - E2E_BASE_URL (opcional, default http://localhost:3000)
 *
 * Para correrlos en local:
 *   1) npx playwright install --with-deps chromium   (primera vez)
 *   2) npm run test:e2e                              (lanza dev server auto)
 *   3) npm run test:e2e:ui                           (modo UI interactivo)
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
