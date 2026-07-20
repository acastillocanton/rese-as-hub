import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

/**
 * Happy paths del login.
 *
 * Datos de prueba consumidos:
 *   - a.castillo.esv@gmail.com (admin)
 *
 * Sales nominales: por ahora la BD tiene 0 sales activos (CLAUDE.md §7), así
 * que el test de redirect sales→/panel queda pendiente hasta que haya un
 * comercial fijo de pruebas. Cuando se cree, añadir aquí.
 */
test.describe("login", () => {
  test("admin → /dashboard tras magic-link", async ({ page }) => {
    await loginAs(page, "a.castillo.esv@gmail.com", "/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("/login carga sin sesión y muestra el formulario", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });
});
