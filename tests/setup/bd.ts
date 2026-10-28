import { afterAll, inject } from "vitest";
import { validarDestinoDePrueba } from "./guarda-bd";

// Apunta la capa de datos real (lib/db/pool) a la base desechable creada por
// bd-global.ts. Si no hay base, no toca nada y los tests se saltan con
// describe.skipIf(!hayBd).
const bd = inject("bdPrueba");

if (bd.disponible) {
  validarDestinoDePrueba({ server: bd.server, database: bd.database });
  process.env.DB_SERVER = bd.server;
  process.env.DB_PORT = String(bd.port);
  process.env.DB_NAME = bd.database;
  process.env.DB_USER = bd.user;
  process.env.DB_PASSWORD = bd.password;
  process.env.DB_ENCRYPT = "true";
  process.env.DB_TRUST_SERVER_CERT = "true";
  process.env.SESSION_SECRET ??= "t".repeat(64);
} else {
  for (const n of Object.keys(process.env)) if (/^DB_/.test(n)) delete process.env[n];
}

// Cierra el pool del módulo al terminar cada archivo; si no, el proceso queda
// colgado esperando conexiones abiertas y el global setup no puede borrar la base.
if (bd.disponible) {
  afterAll(async () => {
    const { getPool } = await import("@/lib/db/pool");
    await (await getPool()).close();
  });
}
