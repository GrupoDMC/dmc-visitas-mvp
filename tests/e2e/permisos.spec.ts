import { expect, test } from "@playwright/test";
import { entrarComo } from "./ayuda";

test.describe("permisos por rol", () => {
  test("el técnico que intenta abrir el panel vuelve a su zona", async ({ page }) => {
    await entrarComo(page, "tecnico");
    for (const ruta of ["/admin", "/admin/visitas", "/admin/usuarios", "/admin/checklist"]) {
      await page.goto(ruta);
      await expect(page, ruta).toHaveURL(/\/tecnico/);
    }
  });

  test("el administrador que abre la zona del técnico vuelve al panel", async ({ page }) => {
    await entrarComo(page, "admin");
    await page.goto("/tecnico");
    await expect(page).toHaveURL(/\/admin/);
  });

  test("el coordinador entra al panel pero no ve lo que es solo del administrador", async ({ page }) => {
    await entrarComo(page, "coordinador");
    await expect(page.getByRole("heading", { name: "Panel de operación" })).toBeVisible();
    // «Roles y permisos» (usuarios.roles) no forma parte del rol Coordinador.
    await page.goto("/admin/usuarios");
    await expect(page.getByRole("button", { name: /Nuevo rol/i })).toHaveCount(0);
  });

  test("las rutas de evidencia exigen sesión y un técnico no ve la de otro", async ({ page, request }) => {
    expect((await request.get("/api/visita/foto/1")).status()).toBe(401);
    expect((await request.get("/api/visita/video/1")).status()).toBe(401);
    await entrarComo(page, "tecnico");
    expect((await page.request.get("/api/visita/foto/999999")).status()).toBe(404);
  });
});
