import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

/**
 * Smoke test de navegación tras login como admin. NO escribe en BD — solo
 * recorre rutas y verifica que cargan. Útil para detectar regresiones de
 * RLS, layouts rotos o redirects erróneos.
 *
 * Si añades una ruta nueva al sidebar admin, considera ampliar este test.
 */
test.describe("admin nav post-login", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "a.castillo.esv@gmail.com", "/dashboard");
  });

  test("/comerciales carga lista", async ({ page }) => {
    await page.goto("/comerciales");
    await expect(page).toHaveURL(/\/comerciales/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("/ranking carga leaderboard", async ({ page }) => {
    await page.goto("/ranking");
    await expect(page).toHaveURL(/\/ranking/);
    // Hay al menos un encabezado (puede ser empty state o tabla real).
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("/fichas carga lista", async ({ page }) => {
    await page.goto("/fichas");
    await expect(page).toHaveURL(/\/fichas/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("/manager/resenas carga lista de reseñas", async ({ page }) => {
    await page.goto("/manager/resenas");
    await expect(page).toHaveURL(/\/manager\/resenas/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
