// Guarda de los tests de base de datos. Es la última línea de defensa para que
// una configuración equivocada no apunte nunca a producción: se exige que el
// servidor sea esta misma máquina y que la base lleve el prefijo `dmc_test_`
// (el que le pone el propio global setup). Cualquier otra cosa aborta antes de
// abrir una conexión.

const SERVIDORES_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "(local)", "."]);
const PATRON_BASE_DE_PRUEBA = /^dmc_test_[a-z0-9]{6,32}$/;

export interface DestinoBd {
  server: string;
  database: string;
}

/** Lanza si el destino no es una base de pruebas local. */
export function validarDestinoDePrueba({ server, database }: DestinoBd): void {
  const host = server.trim().toLowerCase();
  if (!SERVIDORES_LOCALES.has(host)) {
    throw new Error(
      `Los tests de BD solo pueden correr contra localhost; llegó "${server}". ` +
        "Revisa TEST_DB_SERVER: jamás debe apuntar a un servidor compartido o de producción."
    );
  }
  if (!PATRON_BASE_DE_PRUEBA.test(database)) {
    throw new Error(
      `La base de pruebas debe llamarse dmc_test_<id>; llegó "${database}". ` +
        "Los tests no usan ni borran bases con otro nombre."
    );
  }
}

/** Lee `clave=valor` de un texto estilo .env (sin comillas ni expansión). */
export function leerEnv(texto: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linea);
    if (m && !linea.trim().startsWith("#")) salida[m[1]] = m[2];
  }
  return salida;
}
