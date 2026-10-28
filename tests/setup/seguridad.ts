// Red de seguridad común a todos los proyectos que NO son de base de datos.
//
// Ningún test de lógica, acciones, API o componentes puede tocar SQL Server —y
// mucho menos la base de producción—. Se aplican dos barreras independientes:
//
//  1. Se borran del entorno las variables de conexión. Vitest no carga los
//     `.env*` en process.env, pero si el shell tuviera DB_* exportadas
//     (p. ej. las de producción) el pool real las leería.
//  2. El pool se reemplaza por uno que rechaza siempre. Cualquier ruta que
//     llegue a lib/data sin simular antes revienta con un mensaje claro en vez
//     de conectarse en silencio.
//
// Los tests que necesiten datos simulan `@/lib/data/...` (o `@/lib/data/sql`)
// con vi.mock; este archivo es solo el cinturón de seguridad.
import { vi } from "vitest";

for (const nombre of Object.keys(process.env)) {
  if (/^(DB_|HEALTHCHECK_|TEST_DB_)/.test(nombre)) delete process.env[nombre];
}

// Secreto de sesión ficticio, solo para firmar cookies dentro de los tests.
process.env.SESSION_SECRET ??= "t".repeat(64);

vi.mock("@/lib/db/pool", () => ({
  getPool: () =>
    Promise.reject(
      new Error("Un test intentó abrir una conexión a SQL Server. Simula la capa de datos con vi.mock.")
    ),
}));
