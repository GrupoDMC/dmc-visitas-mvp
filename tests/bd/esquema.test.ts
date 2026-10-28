import { describe, expect, it } from "vitest";
import { consulta } from "@/lib/data/sql";
import { hayBd } from "./_ayuda";

describe.skipIf(!hayBd)("BD de pruebas · esquema creado desde el DDL del repo", () => {
  it("es una base desechable dmc_test_*, nunca la de producción", async () => {
    const [{ nombre }] = await consulta<{ nombre: string }>("SELECT DB_NAME() AS nombre");
    expect(nombre).toMatch(/^dmc_test_[a-z0-9]+$/);
  });

  it("trae las tablas, los defaults, las claves foráneas y los triggers que producción tiene", async () => {
    const [r] = await consulta<{ tablas: number; defaults: number; fks: number; triggers: number }>(`
      SELECT (SELECT COUNT(*) FROM sys.tables WHERE SCHEMA_NAME(schema_id)='dmc') AS tablas,
             (SELECT COUNT(*) FROM sys.default_constraints) AS defaults,
             (SELECT COUNT(*) FROM sys.foreign_keys) AS fks,
             (SELECT COUNT(*) FROM sys.triggers WHERE is_ms_shipped = 0) AS triggers`);
    expect(r.tablas).toBeGreaterThan(40);
    expect(r.defaults).toBeGreaterThan(50);
    expect(r.fks).toBeGreaterThan(30);
    expect(r.triggers).toBeGreaterThan(5);
  });
});
