import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { consulta } from "@/lib/data/sql";
import { hayBd, insertarVisita, limpiarDatos, mensajeDeError, sembrarMundo, uno, type Mundo } from "./_ayuda";

// Las restricciones de la base son la última línea de defensa: aunque la app
// falle, ninguna combinación inválida debe poder guardarse.
describe.skipIf(!hayBd)("BD · restricciones del esquema", () => {
  let m: Mundo;

  beforeAll(async () => {
    await limpiarDatos();
  });
  beforeEach(async () => {
    await limpiarDatos();
    m = await sembrarMundo();
  });
  afterAll(() => limpiarDatos());

  describe("unicidad", () => {
    it("el RUT de un cliente no se repite", async () => {
      const e = await mensajeDeError(`INSERT INTO dmc.cliente (rut, razon_social, nombre_fantasia) VALUES ('76.000.001-0', N'Otra', N'Otra')`);
      expect(e).toMatch(/uq_cliente_rut/);
    });

    it("el correo del usuario y el del técnico no se repiten", async () => {
      expect(await mensajeDeError(`INSERT INTO dmc.usuario (email, password_hash, rol) VALUES ('admin@example.com', N'x', 'ADMIN')`)).toMatch(/uq_usuario_email/);
      expect(await mensajeDeError(`INSERT INTO dmc.tecnico (rut, nombres, apellido_paterno, email) VALUES ('33.333.333-3', N'X', N'Y', 'ana@example.com')`)).toMatch(/uq_tecnico_email/);
      expect(await mensajeDeError(`INSERT INTO dmc.tecnico (rut, nombres, apellido_paterno, email) VALUES ('11.111.111-1', N'X', N'Y', 'otro@example.com')`)).toMatch(/uq_tecnico_rut/);
    });

    it("un técnico solo puede estar vinculado a un usuario", async () => {
      const e = await mensajeDeError(`INSERT INTO dmc.usuario (email, password_hash, rol, tecnico_id) VALUES ('copia@example.com', N'x', 'TECNICO', ${m.tecnicoId})`);
      expect(e).toMatch(/uq_usuario_tecnico/);
    });

    it("una marca no puede tener dos sucursales con el mismo nombre", async () => {
      const e = await mensajeDeError(`INSERT INTO dmc.sucursal (cliente_id, marca_id, nombre, direccion, comuna, region)
        VALUES (${m.clienteId}, ${m.marcaId}, N'Tienda Centro', N'Otra', N'X', N'Y')`);
      expect(e).toMatch(/uq_sucursal_marca_nombre/);
    });

    it("el folio de la visita es único y sale de la secuencia, creciente", async () => {
      const a = await insertarVisita(m);
      const b = await insertarVisita(m);
      expect(a.folio).toMatch(/^V-\d{4}-00001$/);
      expect(b.folio).toMatch(/^V-\d{4}-00002$/);
    });
  });

  describe("reglas de negocio (CHECK)", () => {
    it("un usuario TÉCNICO necesita técnico vinculado y los demás roles no pueden tenerlo", async () => {
      expect(await mensajeDeError(`INSERT INTO dmc.usuario (email, password_hash, rol) VALUES ('t@example.com', N'x', 'TECNICO')`)).toMatch(/ck_usuario_tecnico/);
      const libre = await uno<{ id: number }>(`INSERT INTO dmc.tecnico (rut, nombres, apellido_paterno, email) VALUES ('44.444.444-4', N'C', N'D', 'c@example.com'); SELECT SCOPE_IDENTITY() AS id`);
      expect(await mensajeDeError(`INSERT INTO dmc.usuario (email, password_hash, rol, tecnico_id) VALUES ('a2@example.com', N'x', 'ADMIN', ${libre!.id})`)).toMatch(/ck_usuario_tecnico/);
    });

    it("el rol del usuario solo puede ser ADMIN, COORDINADOR o TECNICO", async () => {
      expect(await mensajeDeError(`INSERT INTO dmc.usuario (email, password_hash, rol) VALUES ('x@example.com', N'x', 'SUPERUSUARIO')`)).toMatch(/ck_usuario_rol/);
    });

    it("el estado de la visita está acotado", async () => {
      expect(await mensajeDeError(`UPDATE dmc.visita SET estado = 'INVENTADO' WHERE id = ${(await insertarVisita(m)).id}`)).toMatch(/ck_visita_estado/);
    });

    it("el margen de días debe terminar después de empezar", async () => {
      expect(await mensajeDeError(`INSERT INTO dmc.visita (cliente_id, sucursal_id, tecnico_id, motivo_codigo, fecha_programada, fecha_hasta, trabajo_solicitado)
        VALUES (${m.clienteId}, ${m.sucursalId}, ${m.tecnicoId}, 'VISITA', '2026-10-26', '2026-10-26', N'x')`)).toMatch(/ck_visita_fecha_hasta/);
      await insertarVisita(m, { hasta: "2026-10-30" });
    });

    it("el ayudante no puede ser el mismo técnico asignado", async () => {
      expect(await mensajeDeError(`INSERT INTO dmc.visita (cliente_id, sucursal_id, tecnico_id, tecnico_ayudante_id, motivo_codigo, fecha_programada, trabajo_solicitado)
        VALUES (${m.clienteId}, ${m.sucursalId}, ${m.tecnicoId}, ${m.tecnicoId}, 'VISITA', '2026-10-26', N'x')`)).toMatch(/ck_visita_ayudante/);
      await insertarVisita(m, { ayudante: m.tecnico2Id });
    });

    it("un problema de tipo «Otro» exige una descripción escrita", async () => {
      const v = await insertarVisita(m);
      for (const descripcion of ["NULL", "N''", "N'    '"]) {
        expect(await mensajeDeError(`INSERT INTO dmc.problema (visita_id, tipo_codigo, descripcion) VALUES (${v.id}, 'OTRO', ${descripcion})`)).toMatch(/ck_problema_otro_desc/);
      }
      await consulta(`INSERT INTO dmc.problema (visita_id, tipo_codigo, descripcion) VALUES (${v.id}, 'OTRO', N'Se encontró humedad')`);
    });

    it("un problema RESUELTO debe llevar su fecha de resolución, y uno abierto no", async () => {
      const v = await insertarVisita(m);
      expect(await mensajeDeError(`INSERT INTO dmc.problema (visita_id, tipo_codigo, estado) VALUES (${v.id}, 'ANTENA_NO_DETECTA', 'RESUELTO')`)).toMatch(/ck_problema_resuelto/);
      expect(await mensajeDeError(`INSERT INTO dmc.problema (visita_id, tipo_codigo, estado, resuelto_en) VALUES (${v.id}, 'ANTENA_NO_DETECTA', 'ABIERTO', SYSDATETIME())`)).toMatch(/ck_problema_resuelto/);
    });

    it("la garantía en meses va de 1 a 240", async () => {
      for (const meses of [0, 241, -5]) {
        expect(await mensajeDeError(`UPDATE dmc.cliente SET garantia_meses = ${meses} WHERE id = ${m.clienteId}`)).toMatch(/ck_cliente_garantia_meses/);
        expect(await mensajeDeError(`UPDATE dmc.sucursal SET garantia_meses = ${meses} WHERE id = ${m.sucursalId}`)).toMatch(/ck_sucursal_garantia_meses/);
      }
      await consulta(`UPDATE dmc.cliente SET garantia_meses = 12 WHERE id = ${m.clienteId}`);
    });
  });

  describe("claves foráneas", () => {
    it("una visita necesita cliente, sucursal, técnico y motivo que existan", async () => {
      const base = (campo: string, valor: string) =>
        `INSERT INTO dmc.visita (cliente_id, sucursal_id, tecnico_id, motivo_codigo, fecha_programada, trabajo_solicitado)
         VALUES (${campo === "cliente" ? valor : m.clienteId}, ${campo === "sucursal" ? valor : m.sucursalId},
                 ${campo === "tecnico" ? valor : m.tecnicoId}, ${campo === "motivo" ? valor : "'VISITA'"}, '2026-10-26', N'x')`;
      expect(await mensajeDeError(base("cliente", "99999"))).toMatch(/fk_visita_cliente/);
      expect(await mensajeDeError(base("sucursal", "99999"))).toMatch(/fk_visita_sucursal/);
      expect(await mensajeDeError(base("tecnico", "99999"))).toMatch(/fk_visita_tecnico/);
      expect(await mensajeDeError(base("motivo", "'NO_EXISTE'"))).toMatch(/fk_visita_motivo/);
    });

    it("una sucursal solo puede usar una marca de su mismo cliente (FK compuesta)", async () => {
      await consulta(`INSERT INTO dmc.cliente (rut, razon_social, nombre_fantasia) VALUES ('76.000.002-0', N'Dos SpA', N'Dos')`);
      const otro = (await uno<{ id: number }>(`SELECT id FROM dmc.cliente WHERE rut = '76.000.002-0'`))!.id;
      const e = await mensajeDeError(`INSERT INTO dmc.sucursal (cliente_id, marca_id, nombre, direccion, comuna, region)
        VALUES (${otro}, ${m.marcaId}, N'Cruzada', N'X', N'Y', N'Z')`);
      expect(e).toMatch(/fk_sucursal_marca/);
    });

    it("no se puede borrar un cliente que tiene sucursales o visitas (NO ACTION en maestros)", async () => {
      await insertarVisita(m);
      expect(await mensajeDeError(`DELETE FROM dmc.cliente WHERE id = ${m.clienteId}`)).toMatch(/REFERENCE constraint/i);
      expect(await mensajeDeError(`DELETE FROM dmc.tecnico WHERE id = ${m.tecnicoId}`)).toMatch(/REFERENCE constraint/i);
    });

    it("borrar una visita arrastra sus tablas hijas (CASCADE), nunca deja huérfanos", async () => {
      const v = await insertarVisita(m);
      await consulta(`
        INSERT INTO dmc.problema (visita_id, tipo_codigo) VALUES (${v.id}, 'ANTENA_NO_DETECTA');
        INSERT INTO dmc.visita_ejecucion (visita_id, hora_inicio, responsable_nombre) VALUES (${v.id}, SYSDATETIME(), N'María');
        INSERT INTO dmc.visita_motivo (visita_id, motivo_codigo, ambito) VALUES (${v.id}, 'VISITA', 'PLAN');`);
      await consulta(`DELETE FROM dmc.visita WHERE id = ${v.id}`);
      for (const tabla of ["problema", "visita_ejecucion", "visita_motivo", "visita_estado_historial"]) {
        const n = await uno<{ n: number }>(`SELECT COUNT(*) AS n FROM dmc.${tabla} WHERE visita_id = ${v.id}`);
        expect(Number(n!.n), tabla).toBe(0);
      }
    });
  });

  describe("valores por defecto", () => {
    it("una visita nace PROGRAMADA, activa y con sus marcas de tiempo", async () => {
      const v = await insertarVisita(m);
      const f = await uno<{ estado: string; activo: boolean; creado_en: Date | null; creada_en_terreno: boolean }>(
        `SELECT estado, activo, creado_en, creada_en_terreno FROM dmc.visita WHERE id = ${v.id}`
      );
      expect(f).toMatchObject({ estado: "PROGRAMADA", activo: true, creada_en_terreno: false });
      expect(f!.creado_en).toBeTruthy();
    });

    it("el DDL trae los cuatro estados de problema de siempre", async () => {
      const filas = await consulta<{ codigo: string }>(`SELECT codigo FROM dmc.catalogo_problema_estado ORDER BY orden`);
      expect(filas.map((f) => f.codigo)).toEqual(["ABIERTO", "AGENDADO", "PENDIENTE", "RESUELTO"]);
    });
  });
});
