import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const aqui = (ruta: string) => fileURLToPath(new URL(ruta, import.meta.url));

// Tres proyectos:
//  - unidad:      lógica pura, Server Actions y rutas API con la capa de datos
//                 simulada (entorno node).
//  - componentes: React Testing Library sobre jsdom.
//  - bd:          contra una base de pruebas aislada en localhost (ver
//                 tests/setup/bd.ts). Se salta sola si no está configurada.
//
// Ninguno de los dos primeros abre una conexión a SQL Server: tests/setup/
// seguridad.ts lo impide. `server-only` se reemplaza por un módulo vacío
// porque fuera de Next su import lanza.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "server-only": aqui("./tests/stubs/server-only.ts"),
      "@": aqui("./"),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["lib/**/*.{ts,tsx}", "app/actions/**/*.ts", "app/api/**/*.ts", "components/**/*.{ts,tsx}", "proxy.ts"],
      exclude: ["lib/types.ts", "**/*.d.ts"],
      reporter: ["text-summary", "text", "json-summary", "html"],
      reportsDirectory: "coverage",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unidad",
          environment: "node",
          include: ["tests/unidad/**/*.test.ts", "tests/acciones/**/*.test.ts", "tests/api/**/*.test.ts"],
          setupFiles: ["tests/setup/seguridad.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "componentes",
          environment: "jsdom",
          include: ["tests/componentes/**/*.test.tsx"],
          setupFiles: ["tests/setup/seguridad.ts", "tests/setup/componentes.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "bd",
          environment: "node",
          include: ["tests/bd/**/*.test.ts"],
          setupFiles: ["tests/setup/bd.ts"],
          globalSetup: ["tests/setup/bd-global.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
