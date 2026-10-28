import { describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { leerEnv, validarDestinoDePrueba } from "../setup/guarda-bd";
import { dividirLotes } from "../setup/bd-global";

describe("barrera: los tests no tocan SQL Server", () => {
  it("el pool real está reemplazado y rechaza cualquier conexión", async () => {
    await expect(getPool()).rejects.toThrow(/intentó abrir una conexión/);
  });

  it("las variables de conexión del entorno se borran antes de cada archivo", () => {
    expect(process.env.DB_SERVER).toBeUndefined();
    expect(process.env.DB_PASSWORD).toBeUndefined();
    expect(process.env.HEALTHCHECK_TOKEN).toBeUndefined();
  });
});

describe("validarDestinoDePrueba", () => {
  it("acepta localhost con una base dmc_test_<id>", () => {
    expect(() => validarDestinoDePrueba({ server: "localhost", database: "dmc_test_a1b2c3d4e5f6" })).not.toThrow();
    expect(() => validarDestinoDePrueba({ server: "127.0.0.1", database: "dmc_test_abcdef" })).not.toThrow();
  });

  it("rechaza un servidor que no sea esta máquina (aunque la base se llame bien)", () => {
    expect(() => validarDestinoDePrueba({ server: "10.0.0.5", database: "dmc_test_abcdef" })).toThrow(/localhost/);
    expect(() => validarDestinoDePrueba({ server: "sql.ejemplo.cl", database: "dmc_test_abcdef" })).toThrow(/localhost/);
  });

  it("rechaza las bases reales aunque el servidor sea local", () => {
    for (const database of ["DMC_Contingencia", "DMC_Tecnicos_dev", "master", "dmc_test_", "dmc_test_x", "dmc_test_abc; DROP DATABASE x"]) {
      expect(() => validarDestinoDePrueba({ server: "localhost", database })).toThrow(/dmc_test_/);
    }
  });
});

describe("helpers del global setup", () => {
  it("leerEnv ignora comentarios y líneas vacías", () => {
    expect(leerEnv("# nota\nTEST_DB_USER=yo\n\nTEST_DB_PASSWORD = abc \n  # otra\n")).toEqual({
      TEST_DB_USER: "yo",
      TEST_DB_PASSWORD: "abc",
    });
  });

  it("dividirLotes parte por las líneas GO y descarta los vacíos", () => {
    expect(dividirLotes("SELECT 1;\nGO\nSELECT 2;\n  GO  \nGO\n")).toEqual(["SELECT 1;", "SELECT 2;"]);
    expect(dividirLotes("SELECT 'GO ahora';")).toEqual(["SELECT 'GO ahora';"]);
  });
});
