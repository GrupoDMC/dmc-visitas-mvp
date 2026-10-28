import { expect, type Page } from "@playwright/test";
import { CLAVE_E2E, CUENTAS } from "./base";

/** Entra por la pantalla de login de verdad (nunca por atajos ni cookies fabricadas). */
export async function iniciarSesion(page: Page, cuenta: keyof typeof CUENTAS, clave = CLAVE_E2E) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(CUENTAS[cuenta].email);
  await page.getByLabel("Contraseña", { exact: true }).fill(clave);
  await page.getByRole("button", { name: /Iniciar sesión/ }).click();
}

export async function entrarComo(page: Page, cuenta: keyof typeof CUENTAS) {
  await iniciarSesion(page, cuenta);
  await expect(page).toHaveURL(cuenta === "tecnico" ? /\/tecnico/ : /\/admin/);
}
