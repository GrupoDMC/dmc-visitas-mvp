import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sql from "mssql";
import type { TestProject } from "vitest/node";
import { leerEnv, validarDestinoDePrueba } from "./guarda-bd";

// Crea UNA base desechable `dmc_test_<id>` en el SQL Server local, le aplica el
// DDL del repo y la borra al terminar. Las credenciales salen de `.env.test`
// (ignorado por git) o de variables TEST_DB_*; sin ellas, los tests de BD se
// saltan solos.

declare module "vitest" {
  export interface ProvidedContext {
    bdPrueba: { disponible: false; motivo: string } | { disponible: true; server: string; port: number; user: string; password: string; database: string };
  }
}

const RAIZ = resolve(__dirname, "../..");
let conexionAdmin: sql.ConnectionPool | null = null;
let nombreBase: string | null = null;

function cargarConfig() {
  const archivo = resolve(RAIZ, ".env.test");
  const delArchivo = existsSync(archivo) ? leerEnv(readFileSync(archivo, "utf8")) : {};
  const g = (k: string) => process.env[k] ?? delArchivo[k];
  return { server: g("TEST_DB_SERVER"), port: Number(g("TEST_DB_PORT") ?? 1433), user: g("TEST_DB_USER"), password: g("TEST_DB_PASSWORD") };
}

/** Divide un script de SSMS en lotes por las líneas `GO`. */
export function dividirLotes(script: string): string[] {
  return script
    .split(/^\s*GO\s*(?:--.*)?$/gim)
    .map((l) => l.trim())
    .filter(Boolean);
}

async function aplicar(pool: sql.ConnectionPool, archivo: string) {
  const script = readFileSync(resolve(RAIZ, "sql", archivo), "utf8");
  for (const lote of dividirLotes(script)) await pool.request().batch(lote);
}

export default async function setup(project: TestProject) {
  const cfg = cargarConfig();
  if (!cfg.server || !cfg.user || !cfg.password) {
    project.provide("bdPrueba", {
      disponible: false,
      motivo: "Falta TEST_DB_SERVER/USER/PASSWORD (o .env.test): los tests de BD se saltan.",
    });
    return undefined;
  }

  nombreBase = `dmc_test_${randomBytes(6).toString("hex")}`;
  validarDestinoDePrueba({ server: cfg.server, database: nombreBase });

  const base = {
    server: cfg.server,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    options: { encrypt: true, trustServerCertificate: true },
    requestTimeout: 120_000,
  };
  conexionAdmin = await new sql.ConnectionPool({ ...base, database: "master" }).connect();
  await conexionAdmin.request().batch(`CREATE DATABASE [${nombreBase}]`);

  const pool = await new sql.ConnectionPool({ ...base, database: nombreBase }).connect();
  try {
    await aplicar(pool, "dmc_contingencia_sqlserver.sql");
  } finally {
    await pool.close();
  }

  project.provide("bdPrueba", { disponible: true, ...cfg, server: cfg.server, user: cfg.user, password: cfg.password, port: cfg.port, database: nombreBase });
  return teardown;
}

async function teardown() {
  if (!conexionAdmin || !nombreBase) return;
  try {
    validarDestinoDePrueba({ server: "localhost", database: nombreBase });
    await conexionAdmin.request().batch(
      `ALTER DATABASE [${nombreBase}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${nombreBase}];`
    );
  } finally {
    await conexionAdmin.close();
  }
}
