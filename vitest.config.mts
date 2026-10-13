import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const aqui = (ruta: string) => fileURLToPath(new URL(ruta, import.meta.url));

// Solo lógica pura o con la capa de datos simulada: ningún test abre una
// conexión a SQL Server. `server-only` se reemplaza por un módulo vacío porque
// fuera de Next su import lanza.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": aqui("./tests/stubs/server-only.ts"),
      "@": aqui("./"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/data/**", "lib/db/**", "lib/pdf/**", "lib/types.ts"],
      reporter: ["text-summary", "text"],
    },
  },
});
