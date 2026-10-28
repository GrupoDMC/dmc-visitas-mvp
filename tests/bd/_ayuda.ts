import { inject } from "vitest";
import { consulta } from "@/lib/data/sql";

/** true cuando hay una base de pruebas local lista (ver tests/setup/bd-global.ts). */
export const hayBd = inject("bdPrueba").disponible;

/** Vacía las tablas de datos de visitas entre tests, sin tocar los catálogos del DDL. */
export async function limpiarTodo() {
  await consulta(`
    DECLARE @s nvarchar(max) = N'';
    SELECT @s += N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N' NOCHECK CONSTRAINT ALL;' FROM sys.tables WHERE SCHEMA_NAME(schema_id)='dmc';
    EXEC (@s);`);
}
