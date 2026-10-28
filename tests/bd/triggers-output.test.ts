import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { consulta } from "@/lib/data/sql";
import { hayBd, insertarVisita, limpiarDatos, mensajeDeError, sembrarMundo, uno, type Mundo } from "./_ayuda";

describe.skipIf(!hayBd)("BD · triggers", () => {
  let m: Mundo;
  beforeEach(async () => {
    await limpiarDatos();
    m = await sembrarMundo();
  });
  afterAll(() => limpiarDatos());

  describe("bitácora de estado de la visita (tg_visita_cambio)", () => {
    it("al crear una visita queda anotado su estado inicial", async () => {
      const v = await insertarVisita(m);
      const h = await consulta<{ estado: string }>(`SELECT estado FROM dmc.visita_estado_historial WHERE visita_id = ${v.id}`);
      expect(h.map((x) => x.estado)).toEqual(["PROGRAMADA"]);
    });

    it("cada cambio de estado suma una fila, y un UPDATE que no cambia el estado no suma", async () => {
      const v = await insertarVisita(m);
      await consulta(`UPDATE dmc.visita SET estado = 'EN_CURSO' WHERE id = ${v.id}`);
      await consulta(`UPDATE dmc.visita SET trabajo_solicitado = N'Otro texto' WHERE id = ${v.id}`);
      await consulta(`UPDATE dmc.visita SET estado = 'COMPLETADA' WHERE id = ${v.id}`);
      const h = await consulta<{ estado: string }>(`SELECT estado FROM dmc.visita_estado_historial WHERE visita_id = ${v.id} ORDER BY id`);
      expect(h.map((x) => x.estado)).toEqual(["PROGRAMADA", "EN_CURSO", "COMPLETADA"]);
    });

    it("la bitácora registra a qué técnico estaba asignada en ese momento", async () => {
      const v = await insertarVisita(m);
      const h = await uno<{ tecnico_id: number }>(`SELECT tecnico_id FROM dmc.visita_estado_historial WHERE visita_id = ${v.id}`);
      expect(Number(h!.tecnico_id)).toBe(m.tecnicoId);
    });

    it("al actualizar una visita se refresca actualizado_en", async () => {
      const v = await insertarVisita(m);
      await consulta(`UPDATE dmc.visita SET actualizado_en = '2020-01-01' WHERE id = ${v.id}`);
      // El trigger vuelve a sellarlo en el mismo UPDATE.
      const f = await uno<{ anio: number }>(`SELECT YEAR(actualizado_en) AS anio FROM dmc.visita WHERE id = ${v.id}`);
      expect(Number(f!.anio)).toBeGreaterThanOrEqual(2026);
    });
  });

  describe("resuelto_en del problema (tg_problema_cambio)", () => {
    async function problemaAbierto() {
      const v = await insertarVisita(m);
      await consulta(`INSERT INTO dmc.problema (visita_id, tipo_codigo) VALUES (${v.id}, 'ANTENA_NO_DETECTA')`);
      const p = await uno<{ id: number }>(`SELECT TOP 1 id FROM dmc.problema ORDER BY id DESC`);
      return Number(p!.id);
    }

    it("al pasar a RESUELTO se llena solo, y al reabrirlo se limpia", async () => {
      const id = await problemaAbierto();
      // ck_problema_resuelto exige la fecha en el mismo UPDATE: el trigger solo conserva/limpia.
      await consulta(`UPDATE dmc.problema SET estado = 'RESUELTO', resuelto_en = SYSDATETIME() WHERE id = ${id}`);
      expect((await uno<{ r: Date | null }>(`SELECT resuelto_en AS r FROM dmc.problema WHERE id = ${id}`))!.r).toBeTruthy();
      await consulta(`UPDATE dmc.problema SET estado = 'ABIERTO', resuelto_en = NULL WHERE id = ${id}`);
      expect((await uno<{ r: Date | null }>(`SELECT resuelto_en AS r FROM dmc.problema WHERE id = ${id}`))!.r).toBeNull();
    });

    it("la vista de problemas abiertos solo trae los no resueltos de visitas activas", async () => {
      const id = await problemaAbierto();
      let n = await uno<{ n: number }>(`SELECT COUNT(*) AS n FROM dmc.v_problema_abierto`);
      expect(Number(n!.n)).toBe(1);
      await consulta(`UPDATE dmc.problema SET estado = 'RESUELTO', resuelto_en = SYSDATETIME() WHERE id = ${id}`);
      n = await uno<{ n: number }>(`SELECT COUNT(*) AS n FROM dmc.v_problema_abierto`);
      expect(Number(n!.n)).toBe(0);
    });
  });

  describe("sellos de actualización en los maestros", () => {
    it("editar un cliente o un técnico refresca actualizado_en", async () => {
      await consulta(`UPDATE dmc.cliente SET actualizado_en = '2020-01-01' WHERE id = ${m.clienteId}`);
      await consulta(`UPDATE dmc.tecnico SET actualizado_en = '2020-01-01' WHERE id = ${m.tecnicoId}`);
      const c = await uno<{ a: number }>(`SELECT YEAR(actualizado_en) AS a FROM dmc.cliente WHERE id = ${m.clienteId}`);
      const t = await uno<{ a: number }>(`SELECT YEAR(actualizado_en) AS a FROM dmc.tecnico WHERE id = ${m.tecnicoId}`);
      expect(Number(c!.a)).toBeGreaterThanOrEqual(2026);
      expect(Number(t!.a)).toBeGreaterThanOrEqual(2026);
    });
  });
});

describe.skipIf(!hayBd)("BD · OUTPUT sin INTO frente a los triggers", () => {
  let m: Mundo;
  beforeEach(async () => {
    await limpiarDatos();
    m = await sembrarMundo();
  });
  afterAll(() => limpiarDatos());

  const insertVisita = (salida: string) => `
    INSERT INTO dmc.visita (cliente_id, sucursal_id, tecnico_id, motivo_codigo, fecha_programada, trabajo_solicitado)
    ${salida}
    VALUES (${m.clienteId}, ${m.sucursalId}, ${m.tecnicoId}, 'VISITA', '2026-10-26', N'x')`;

  it("en dmc.visita, INSERT … OUTPUT sin INTO revienta (por eso la app usa SCOPE_IDENTITY)", async () => {
    expect(await mensajeDeError(insertVisita("OUTPUT INSERTED.id"))).toMatch(/OUTPUT clause without INTO clause is not allowed|trigger/i);
  });

  it("en dmc.visita, INSERT … OUTPUT … INTO una tabla de paso sí funciona", async () => {
    const filas = await consulta<{ id: number }>(`
      DECLARE @nuevo TABLE (id bigint);
      ${insertVisita("OUTPUT INSERTED.id INTO @nuevo")};
      SELECT id FROM @nuevo;`);
    expect(Number(filas[0].id)).toBeGreaterThan(0);
  });

  it("en dmc.visita, el patrón de la app (INSERT + SCOPE_IDENTITY) devuelve id y folio", async () => {
    const filas = await consulta<{ id: number; folio: string }>(`
      ${insertVisita("")};
      SELECT id, folio FROM dmc.visita WHERE id = SCOPE_IDENTITY();`);
    expect(Number(filas[0].id)).toBeGreaterThan(0);
    expect(filas[0].folio).toMatch(/^V-\d{4}-\d{5}$/);
  });

  it("en dmc.problema ocurre lo mismo", async () => {
    const v = await insertarVisita(m);
    const sinInto = `INSERT INTO dmc.problema (visita_id, tipo_codigo) OUTPUT INSERTED.id VALUES (${v.id}, 'ANTENA_NO_DETECTA')`;
    expect(await mensajeDeError(sinInto)).toMatch(/OUTPUT clause without INTO clause is not allowed|trigger/i);
    const conInto = await consulta<{ id: number }>(`
      DECLARE @n TABLE (id bigint);
      INSERT INTO dmc.problema (visita_id, tipo_codigo) OUTPUT INSERTED.id INTO @n VALUES (${v.id}, 'ANTENA_NO_DETECTA');
      SELECT id FROM @n;`);
    expect(Number(conInto[0].id)).toBeGreaterThan(0);
  });

  it("en una tabla cuyo trigger es solo de UPDATE (cliente), el INSERT … OUTPUT sí se permite, pero el UPDATE … OUTPUT no", async () => {
    const insertado = await consulta<{ id: number }>(
      `INSERT INTO dmc.cliente (rut, razon_social, nombre_fantasia) OUTPUT INSERTED.id AS id VALUES ('76.000.009-0', N'Nueva', N'Nueva')`
    );
    expect(Number(insertado[0].id)).toBeGreaterThan(0);
    expect(await mensajeDeError(`UPDATE dmc.cliente SET notas = N'x' OUTPUT INSERTED.id WHERE id = ${m.clienteId}`)).toMatch(/OUTPUT clause without INTO clause is not allowed|trigger/i);
  });
});

/**
 * Vigilante estático: ningún SQL de lib/data puede usar OUTPUT sin INTO sobre
 * una tabla que tenga un trigger de esa misma operación (INSERT/UPDATE/DELETE).
 * Es el error que ya reventó en producción con dmc.problema y dmc.visita.
 */
describe.skipIf(!hayBd)("BD · ningún SQL de la app usa OUTPUT sin INTO sobre una tabla con trigger", () => {
  it("recorre lib/data/*.ts y cruza cada OUTPUT con los triggers reales de la base", async () => {
    const triggers = await consulta<{ tabla: string; evento: string }>(`
      SELECT OBJECT_NAME(t.parent_id) AS tabla, e.type_desc AS evento
        FROM sys.triggers t JOIN sys.trigger_events e ON e.object_id = t.object_id
       WHERE t.is_ms_shipped = 0 AND t.is_disabled = 0`);
    const conTrigger = (tabla: string, evento: string) => triggers.some((t) => t.tabla === tabla && t.evento === evento);

    const dir = resolve(__dirname, "../../lib/data");
    const hallazgos: string[] = [];
    let revisados = 0;
    for (const archivo of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const fuente = readFileSync(resolve(dir, archivo), "utf8");
      // Cada sentencia: desde su verbo hasta el OUTPUT que la sigue.
      const patron = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+dmc\.(\w+)[^;`]*?\bOUTPUT\b([^;`]*)/gi;
      for (const m of fuente.matchAll(patron)) {
        revisados++;
        if (/\bINTO\b/i.test(m[3])) continue;
        const verbo = m[1].toUpperCase();
        const evento = verbo.startsWith("INSERT") ? "INSERT" : verbo.startsWith("UPDATE") ? "UPDATE" : "DELETE";
        if (conTrigger(m[2], evento)) hallazgos.push(`${archivo}: ${evento} dmc.${m[2]} … OUTPUT sin INTO, y la tabla tiene trigger de ${evento}`);
      }
    }
    expect(revisados, "el vigilante no encontró ningún OUTPUT: la expresión regular dejó de servir").toBeGreaterThan(5);
    expect(hallazgos).toEqual([]);
  });
});
