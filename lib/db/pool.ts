import "server-only";
import sql from "mssql";
import { getSqlConfig } from "./config";

// Pool perezoso: no se conecta a nada hasta la primera llamada a getPool().
// Si la conexión falla se descarta la promesa para que el siguiente intento
// reconecte en vez de quedar clavado en el error.
//
// En serverless (Vercel) el módulo vive lo que vive la instancia: el pool se
// reaprovecha entre invocaciones de la misma instancia y muere con ella.
let poolPromesa: Promise<sql.ConnectionPool> | null = null;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromesa) {
    poolPromesa = new sql.ConnectionPool(getSqlConfig())
      .connect()
      .then((pool) => {
        // Una desconexión del servidor deja el pool inservible: si no se
        // limpia la promesa, todas las peticiones siguientes fallan igual.
        pool.on("error", () => {
          poolPromesa = null;
        });
        return pool;
      })
      .catch((err) => {
        poolPromesa = null;
        throw err;
      });
  }
  return poolPromesa;
}
