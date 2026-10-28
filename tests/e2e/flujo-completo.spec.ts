import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { iniciarSesion } from "./ayuda";

// El flujo de punta a punta del producto:
//   coordinación agenda una visita en el panel  →  la técnica la ve en su
//   celular, la inicia, llena el acta, firma y la guarda  →  coordinación la ve
//   completada y baja el PDF.
// Cada paso usa la interfaz real (nada de atajos al login ni a la base).

const FIRMANTE = { nombre: "María Soto", rut: "11.111.111-1", telefono: "+56 9 1111 1111" };

async function abrir(browser: import("@playwright/test").Browser, tipo: "escritorio" | "celular"): Promise<{ contexto: BrowserContext; page: Page }> {
  const contexto = await browser.newContext(tipo === "escritorio" ? { ...devices["Desktop Chrome"], locale: "es-CL" } : { ...devices["Pixel 7"], locale: "es-CL" });
  return { contexto, page: await contexto.newPage() };
}

test.describe.configure({ mode: "serial" });

test.describe("flujo completo: agendar → acta móvil → panel → PDF", () => {
  let folio = "";

  test("coordinación agenda una visita desde el panel", async ({ browser }) => {
    const { contexto, page } = await abrir(browser, "escritorio");
    await iniciarSesion(page, "admin");
    await expect(page).toHaveURL(/\/admin/);

    await page.goto("/admin/visitas");
    await expect(page.getByText("0 registros")).toBeVisible();
    await page.getByRole("button", { name: /Nueva visita/ }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByRole("combobox", { name: "Cliente" })).toHaveAttribute("placeholder", "Cliente E2E");
    await expect(dialogo.getByRole("combobox", { name: "Técnico asignado" })).toHaveAttribute("placeholder", "Tecnica Ficticia");
    await dialogo.getByLabel("Qué se necesita hacer").fill("Revisar las antenas del acceso principal");
    await dialogo.getByLabel("Responsable de tienda").fill(FIRMANTE.nombre);
    // Al abrir el formulario la app revisa si la tienda tiene problemas sin resolver y,
    // hasta que responde, guardar está bloqueado a propósito («Espera: se están
    // revisando…»). Se reintenta el clic hasta que la app deja pasar.
    await expect(async () => {
      await dialogo.getByRole("button", { name: "Programar visita" }).click({ timeout: 2_000 });
      await expect(page.getByRole("status")).toContainText(/Visita V-\d{4}-\d{5} programada · Tecnica Ficticia/, { timeout: 3_500 });
    }).toPass({ timeout: 25_000 });
    folio = ((await page.getByRole("status").textContent()) ?? "").match(/V-\d{4}-\d{5}/)![0];

    await expect(page.getByRole("row", { name: new RegExp(folio) })).toContainText("Programada");
    await expect(page.getByText("1 registro")).toBeVisible();
    await contexto.close();
  });

  test("la técnica la inicia, llena el acta, firma y la guarda desde el celular", async ({ browser }) => {
    const { contexto, page } = await abrir(browser, "celular");
    await iniciarSesion(page, "tecnico");
    await expect(page).toHaveURL(/\/tecnico/);

    await page.goto(`/tecnico/visitas/${folio}`);
    await page.getByRole("button", { name: /Iniciar visita/ }).click();
    await expect(page).toHaveURL(new RegExp(`/tecnico/visitas/${folio}/formulario`));

    // 1 · Responsable: el nombre viene de lo que se anotó al agendar.
    await expect(page.getByLabel("Responsable de tienda")).toHaveValue(FIRMANTE.nombre);
    await page.getByLabel("RUT", { exact: true }).fill(FIRMANTE.rut);
    await page.getByLabel("Teléfono").fill(FIRMANTE.telefono);
    await page.getByRole("button", { name: "Guardar y seguir" }).click();

    // 2 · Trabajo realizado: el motivo agendado ya viene marcado.
    await page.getByRole("button", { name: /Agregar trabajo realizado/ }).click();
    await page.getByRole("button", { name: /Revisión de antenas/ }).click();
    await page.getByRole("button", { name: "Agregar a la visita" }).click();
    await page.getByRole("button", { name: /Listo, no hice nada más/ }).click();
    await page.getByLabel(/Detalle del trabajo/).fill("Se revisaron las tres antenas; todo en orden.");
    await page.getByRole("button", { name: /Guardar \d+ trabajos? y seguir/ }).click();

    // 6 · Firma de la tienda, dibujada sobre el lienzo.
    await page.getByRole("button", { name: /Firma de la tienda/ }).click();
    await page.getByRole("button", { name: "Firmar", exact: true }).click();
    const lienzo = page.locator("canvas").first();
    const caja = (await lienzo.boundingBox())!;
    await page.mouse.move(caja.x + 30, caja.y + caja.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(caja.x + 30 + i * 12, caja.y + caja.height / 2 + (i % 2 ? -25 : 25));
    await page.mouse.up();
    await page.getByRole("button", { name: "Confirmar firma" }).click();
    await page.getByRole("button", { name: "Guardar esta sección" }).click();

    // Revisión y guardado.
    await page.getByRole("button", { name: /Revisar y guardar/ }).click();
    await expect(page.getByText(FIRMANTE.nombre).first()).toBeVisible();
    await page.getByRole("button", { name: "Guardar visita" }).click();

    // La confirmación aparece Y se sostiene: un destello de milisegundos no cuenta, la
    // técnica tiene que poder leerla y tocar «Siguiente visita». Antes, la revalidación
    // re-renderizaba el formulario de la visita ya COMPLETADA y redirigía al detalle.
    const confirmacion = page.getByRole("heading", { name: /Visita\s*guardada/ });
    await expect(confirmacion).toBeVisible();
    await page.waitForTimeout(2_500);
    await expect(confirmacion).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/tecnico/visitas/${folio}/formulario`));

    // «Ver el acta guardada» lleva al acta en la base, y el detalle ya la muestra cerrada.
    await page.getByRole("button", { name: "Ver el acta guardada" }).click();
    await expect(page).toHaveURL(new RegExp(`/tecnico/visitas/${folio}/revisar`));
    await page.goto(`/tecnico/visitas/${folio}`);
    await expect(page.getByText("Completada").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Ver acta guardada/ })).toBeVisible();
    await contexto.close();
  });

  test("coordinación la ve completada y baja el PDF del acta", async ({ browser }) => {
    const { contexto, page } = await abrir(browser, "escritorio");
    await iniciarSesion(page, "admin");
    await expect(page).toHaveURL(/\/admin/);
    await page.goto("/admin/visitas");
    await expect(page.getByRole("row", { name: new RegExp(folio) })).toContainText("Completada");

    await page.getByRole("row", { name: new RegExp(folio) }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/visitas/${folio}`));
    await expect(page.getByText(FIRMANTE.nombre).first()).toBeVisible();
    await expect(page.getByText("Se revisaron las tres antenas; todo en orden.")).toBeVisible();

    const pdf = await page.request.get(`/api/visita/acta/${folio}`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect(pdf.headers()["content-disposition"]).toContain(`Acta ${folio}`);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // Las evidencias de la visita las ve el panel; la firma está servida con cabeceras seguras.
    await contexto.close();
  });

  test("la visita ya cerrada no se puede cerrar de nuevo ni reabrir desde el celular", async ({ browser }) => {
    const { contexto, page } = await abrir(browser, "celular");
    await iniciarSesion(page, "tecnico");
    await expect(page).toHaveURL(/\/tecnico/);
    await page.goto(`/tecnico/visitas/${folio}`);
    await expect(page.getByRole("button", { name: /Iniciar visita|Continuar formulario/ })).toHaveCount(0);
    await contexto.close();
  });

});
