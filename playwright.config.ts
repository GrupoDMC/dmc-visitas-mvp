import { defineConfig, devices } from "@playwright/test";
import { PUERTO, configBd, entornoDeLaApp } from "./tests/e2e/base";

// E2E contra una base SQL Server desechable en localhost (nunca producción):
// tests/e2e/base.ts crea `dmc_test_e2e0001`, la app se construye aparte
// (.next-e2e) y se levanta con TODAS sus variables de BD apuntando ahí; el
// global setup lo verifica con /api/salud antes de empezar.
// Sin .env.test no hay base y la suite E2E no corre.
const hayBase = configBd() !== null;
const entorno = entornoDeLaApp();

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  globalSetup: hayBase ? "./tests/e2e/global-setup.ts" : undefined,
  globalTeardown: hayBase ? "./tests/e2e/global-teardown.ts" : undefined,
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-CL",
    timezoneId: "America/Santiago",
  },
  projects: [
    {
      name: "escritorio",
      testMatch: /(autenticacion|permisos|panel)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "celular",
      testMatch: /flujo-completo\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: hayBase
    ? {
        command: `npm run build && npm run start -- -p ${PUERTO}`,
        url: `http://localhost:${PUERTO}/login`,
        timeout: 300_000,
        reuseExistingServer: false,
        env: { ...(process.env as Record<string, string>), ...entorno },
        stdout: "ignore",
        stderr: "pipe",
      }
    : undefined,
});
