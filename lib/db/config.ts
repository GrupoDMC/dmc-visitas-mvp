import type { config as MssqlConfig } from "mssql";

// Instancia local SQL2022, puerto TCP 14330 (no el 1433 default).
// El schema vive en sql/dmc_contingencia_sqlserver.sql (esquema `dmc`).
// Nada de esto se invoca todavía: mientras DB_NAME/DB_USER/DB_PASSWORD (o Windows Auth)
// no estén confirmados, la app sirve datos desde lib/mock/*.
export function getSqlConfig(): MssqlConfig {
  const database = process.env.DB_NAME;
  if (!database) {
    throw new Error(
      "DB_NAME no está configurado. Define DB_NAME (y DB_USER/DB_PASSWORD, o DB_TRUSTED_CONNECTION=true) en .env.local antes de usar la capa de conexión real."
    );
  }

  const useWindowsAuth = process.env.DB_TRUSTED_CONNECTION === "true";

  return {
    server: process.env.DB_SERVER ?? "localhost",
    port: Number(process.env.DB_PORT ?? 14330),
    database,
    ...(useWindowsAuth
      ? {}
      : {
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
        }),
    options: {
      encrypt: true,
      trustServerCertificate: true, // cert autofirmado en dev local
      trustedConnection: useWindowsAuth, // Windows Integrated Security
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}
