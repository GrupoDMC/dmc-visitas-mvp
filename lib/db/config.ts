import "server-only";
import type { config as MssqlConfig } from "mssql";
import { enProduccion, env, envBooleana, envNumero, envObligatoria } from "@/lib/env";

// Configuración del driver a partir del entorno. Se evalúa en cada llamada a
// getPool(), así que un error aquí se ve en el log del despliegue y no rompe
// el build.

export function getSqlConfig(): MssqlConfig {
  const database = envObligatoria(
    "DB_NAME",
    "Es el nombre de la base de datos en SQL Server. Defínela en el entorno del despliegue."
  );
  const user = envObligatoria("DB_USER", "Usuario de autenticación SQL con permisos sobre el esquema dmc.");
  const password = envObligatoria("DB_PASSWORD", "Contraseña del usuario SQL. Nunca la escribas en un archivo del repositorio.");

  if (envBooleana("DB_TRUSTED_CONNECTION", false)) {
    // options.trustedConnection es exclusiva del driver msnodesqlv8. Con
    // mssql@11 (tedious) se ignora en silencio y el driver termina intentando
    // conectar sin credenciales, con un error de login desconcertante.
    throw new Error(
      "DB_TRUSTED_CONNECTION=true no está soportado: este proyecto usa mssql@11 sobre el driver tedious, que ignora la autenticación integrada de Windows. Usa autenticación SQL (DB_USER / DB_PASSWORD)."
    );
  }

  const encrypt = envBooleana("DB_ENCRYPT", true);
  const trustServerCertificate = envBooleana("DB_TRUST_SERVER_CERT", false);

  if (enProduccion && !encrypt) {
    throw new Error(
      "DB_ENCRYPT=false en producción: la contraseña y los datos viajarían en claro. Habilita TLS en el SQL Server y quita esa variable."
    );
  }

  if (enProduccion && trustServerCertificate) {
    // Se avisa pero no se bloquea: el canal sigue cifrado y bloquear el
    // despliegue por esto dejaría la app caída. Aun así hay que arreglarlo.
    console.warn(
      "[dmc] DB_TRUST_SERVER_CERT=true en producción: el canal va cifrado pero no se valida el certificado del servidor, así que la conexión queda expuesta a man-in-the-middle. Instala un certificado de una CA de confianza en el SQL Server y pon la variable en false."
    );
  }

  return {
    server: envObligatoria("DB_SERVER", "Host o IP de la instancia de SQL Server."),
    port: envNumero("DB_PORT", 1433),
    database,
    user,
    password,
    options: {
      encrypt,
      trustServerCertificate,
    },
    // Tiempos cortos: en serverless una conexión colgada consume la invocación
    // entera y el usuario se queda mirando una pantalla en blanco.
    connectionTimeout: envNumero("DB_CONNECT_TIMEOUT_MS", 15_000),
    requestTimeout: envNumero("DB_REQUEST_TIMEOUT_MS", 15_000),
    pool: {
      // Cada instancia serverless abre su propio pool: con muchas instancias
      // vivas, un max alto agota las conexiones del servidor SQL. En Vercel,
      // mantener DB_POOL_MAX bajo (2-4).
      max: envNumero("DB_POOL_MAX", 4),
      min: 0,
      idleTimeoutMillis: envNumero("DB_POOL_IDLE_MS", 30_000),
    },
  };
}

/** Descripción del destino, sin credenciales. Para logs y diagnóstico. */
export function describirDestinoSql(): string {
  return `${env("DB_SERVER") ?? "?"}:${env("DB_PORT") ?? "1433"}/${env("DB_NAME") ?? "?"}`;
}
