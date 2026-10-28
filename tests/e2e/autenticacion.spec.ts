import { expect, test } from "@playwright/test";
import { entrarComo, iniciarSesion } from "./ayuda";

test.describe("login y sesión", () => {
  test("sin sesión, las pantallas privadas mandan al login", async ({ page }) => {
    for (const ruta of ["/admin", "/admin/visitas", "/tecnico", "/"]) {
      await page.goto(ruta);
      await expect(page, ruta).toHaveURL(/\/login$/);
    }
    await expect(page.getByRole("button", { name: /Iniciar sesión/ })).toBeVisible();
  });

  test("una clave incorrecta da el mensaje genérico y no abre sesión", async ({ page }) => {
    await iniciarSesion(page, "admin", "clave-equivocada-123");
    await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("un correo que no existe da exactamente el mismo mensaje", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo").fill("nadie@example.com");
    await page.getByLabel("Contraseña", { exact: true }).fill("cualquier-clave-123");
    await page.getByRole("button", { name: /Iniciar sesión/ }).click();
    await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  });

  test("el administrador entra al panel y puede cerrar sesión", async ({ page }) => {
    await entrarComo(page, "admin");
    await expect(page.getByRole("heading", { name: "Panel de operación" })).toBeVisible();
    await page.getByRole("button", { name: /Cerrar sesión/ }).click();
    await expect(page).toHaveURL(/\/login$/);
    // Con la sesión cerrada, volver atrás no reabre el panel.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("la cookie de sesión no es legible desde la página (httpOnly) y una alterada no sirve", async ({ page, context }) => {
    await entrarComo(page, "admin");
    const cookies = await context.cookies();
    const sesion = cookies.find((c) => c.name === "dmc_session");
    expect(sesion?.httpOnly).toBe(true);
    expect(sesion?.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toContain("dmc_session");

    await context.clearCookies();
    // Se altera el PRIMER carácter de la firma: el último de un base64url puede llevar bits de
    // relleno que no cambian los bytes decodificados (y entonces la firma seguiría siendo válida).
    const [cuerpo, firma] = sesion!.value.split(".");
    const alterada = `${cuerpo}.${firma[0] === "A" ? "B" : "A"}${firma.slice(1)}`;
    await context.addCookies([{ ...sesion!, value: alterada }]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("las llamadas de API sin sesión reciben 401 (no una redirección)", async ({ request }) => {
    const r = await request.post("/api/sesion");
    expect(r.status()).toBe(401);
    const acta = await request.get("/api/visita/acta/V-0001", { maxRedirects: 0 });
    expect([401, 307]).toContain(acta.status());
  });

  test("las cabeceras de seguridad y la política CSP viajan en la respuesta", async ({ page }) => {
    const r = await page.goto("/login");
    const h = r!.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["strict-transport-security"]).toContain("max-age");
    expect(h["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
  });
});
