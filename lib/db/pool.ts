import sql from "mssql";
import { getSqlConfig } from "./config";

// Pool perezoso: no se conecta a nada hasta que algo llame a getPool().
// Nada en la app llama a esto todavía — mientras el schema no esté confirmado,
// las páginas leen de lib/mock/*. Cuando el schema quede confirmado, los
// endpoints que necesiten datos reales importan getPool() en vez de los mocks.
let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(getSqlConfig()).connect().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}
