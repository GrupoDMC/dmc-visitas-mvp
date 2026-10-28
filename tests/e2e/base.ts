import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import sql from "mssql";
import { leerEnv, validarDestinoDePrueba } from "../setup/guarda-bd";
import { dividirLotes } from "../setup/bd-global";

// Base desechable de los tests E2E. A diferencia de los tests de BD, el nombre
// es fijo (la app que se levanta necesita conocerlo de antemano), pero pasa por
// la misma guarda: solo localhost y solo `dmc_test_*`.

export const BASE_E2E = "dmc_test_e2e0001";
export const CLAVE_E2E = "E2e-Clave-Segura-123";
export const CUENTAS = {
  admin: { email: "admin.e2e@example.com", rol: "ADMIN" },
  coordinador: { email: "coordinadora.e2e@example.com", rol: "COORDINADOR" },
  tecnico: { email: "tecnico.e2e@example.com", rol: "TECNICO" },
} as const;
export const TOKEN_SALUD = "token-salud-e2e-" + "0".repeat(16);
export const PUERTO = 3100;

const RAIZ = resolve(__dirname, "../..");

export function configBd() {
  const archivo = resolve(RAIZ, ".env.test");
  const delArchivo = existsSync(archivo) ? leerEnv(readFileSync(archivo, "utf8")) : {};
  const g = (k: string) => process.env[k] ?? delArchivo[k];
  const cfg = { server: g("TEST_DB_SERVER"), port: Number(g("TEST_DB_PORT") ?? 1433), user: g("TEST_DB_USER"), password: g("TEST_DB_PASSWORD") };
  if (!cfg.server || !cfg.user || !cfg.password) return null;
  validarDestinoDePrueba({ server: cfg.server, database: BASE_E2E });
  return cfg as { server: string; port: number; user: string; password: string };
}

const opciones = (cfg: NonNullable<ReturnType<typeof configBd>>, database: string): sql.config => ({
  ...cfg,
  database,
  options: { encrypt: true, trustServerCertificate: true },
  requestTimeout: 120_000,
});

export async function borrarBaseE2E() {
  const cfg = configBd();
  if (!cfg) return;
  validarDestinoDePrueba({ server: cfg.server, database: BASE_E2E });
  const admin = await new sql.ConnectionPool(opciones(cfg, "master")).connect();
  try {
    await admin
      .request()
      .batch(
        `IF DB_ID('${BASE_E2E}') IS NOT NULL BEGIN ALTER DATABASE [${BASE_E2E}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${BASE_E2E}]; END`
      );
  } finally {
    await admin.close();
  }
}

/** Crea la base, aplica el DDL y siembra datos ficticios y cuentas conocidas. */
export async function crearBaseE2E() {
  const cfg = configBd();
  if (!cfg) throw new Error("Faltan TEST_DB_* (ver .env.test.example): los E2E necesitan una base local desechable.");
  await borrarBaseE2E();

  const admin = await new sql.ConnectionPool(opciones(cfg, "master")).connect();
  await admin.request().batch(`CREATE DATABASE [${BASE_E2E}]`);
  await admin.close();

  const pool = await new sql.ConnectionPool(opciones(cfg, BASE_E2E)).connect();
  try {
    const ddl = readFileSync(resolve(RAIZ, "sql/dmc_contingencia_sqlserver.sql"), "utf8");
    for (const lote of dividirLotes(ddl)) await pool.request().batch(lote);

    const hash = await bcrypt.hash(CLAVE_E2E, 6);
    await pool.request().batch(`
      INSERT INTO dmc.catalogo_motivo (codigo, nombre, orden) VALUES
        ('VISITA', N'Visita preventiva', 1), ('CALIBRACION', N'Calibración de las antenas', 2);
      INSERT INTO dmc.catalogo_problema (codigo, nombre, grupo_label, singular, orden) VALUES
        ('ANTENA_NO_DETECTA', N'Antena no detecta etiquetas', N'Antena afectada', N'antena', 1), ('OTRO', N'Otro', NULL, NULL, 2);
      INSERT INTO dmc.catalogo_trabajo (codigo, nombre, orden) VALUES ('REVISION_ANTENAS', N'Revisión de antenas', 1);
      INSERT INTO dmc.catalogo_motivo_trabajo (motivo_id, trabajo_id, orden)
        SELECT m.id, t.id, 1 FROM dmc.catalogo_motivo m CROSS JOIN dmc.catalogo_trabajo t WHERE m.codigo = 'VISITA';
      INSERT INTO dmc.cliente (rut, razon_social, nombre_fantasia) VALUES ('76.000.001-0', N'Cliente E2E SpA', N'Cliente E2E');
      INSERT INTO dmc.marca (cliente_id, nombre) SELECT id, N'Marca E2E' FROM dmc.cliente;
      INSERT INTO dmc.sucursal (cliente_id, marca_id, nombre, direccion, comuna, region)
        SELECT c.id, m.id, N'Tienda E2E Centro', N'Av. Ficticia 100', N'Santiago', N'Metropolitana'
          FROM dmc.cliente c JOIN dmc.marca m ON m.cliente_id = c.id;
      INSERT INTO dmc.tecnico (rut, nombres, apellido_paterno, email) VALUES ('11.111.111-1', N'Tecnica', N'Ficticia', '${CUENTAS.tecnico.email}');
      INSERT INTO dmc.usuario (email, password_hash, rol) VALUES ('${CUENTAS.admin.email}', N'${hash}', 'ADMIN');
      INSERT INTO dmc.usuario (email, password_hash, rol, tecnico_id)
        SELECT '${CUENTAS.tecnico.email}', N'${hash}', 'TECNICO', id FROM dmc.tecnico;
      INSERT INTO dmc.usuario (email, password_hash, rol, rol_id)
        SELECT '${CUENTAS.coordinador.email}', N'${hash}', 'COORDINADOR', id FROM dmc.rol WHERE nombre = N'Coordinador';
    `);
  } finally {
    await pool.close();
  }
}

/** Variables con que se levanta la app bajo prueba: TODAS apuntan a la base E2E local. */
export function entornoDeLaApp(): Record<string, string> {
  const cfg = configBd();
  if (!cfg) return {};
  return {
    DB_SERVER: cfg.server,
    DB_PORT: String(cfg.port),
    DB_NAME: BASE_E2E,
    DB_USER: cfg.user,
    DB_PASSWORD: cfg.password,
    DB_ENCRYPT: "true",
    DB_TRUST_SERVER_CERT: "true",
    SESSION_SECRET: randomBytes(32).toString("hex"),
    HEALTHCHECK_TOKEN: TOKEN_SALUD,
    NEXT_DIST_DIR: ".next-e2e",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
