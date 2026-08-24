import "server-only";
import { agrupar, consulta, consultaCon, ejecutar, num, sql } from "@/lib/data/sql";
import { MOTIVOS_FABRICA, PROBLEMAS_FABRICA, TRABAJOS_FABRICA } from "@/lib/data/catalogo-fabrica";
import type {
  CatalogoMotivo,
  CatalogoProblema,
  CatalogoProblemaOpcion,
  CatalogoTrabajo,
  CatalogoTrabajoSubtrabajo,
} from "@/lib/types";

// Las tres listas que el panel edita y el móvil consume:
// dmc.catalogo_motivo, dmc.catalogo_problema (+opciones) y
// dmc.catalogo_trabajo (+subtrabajos).
//
// Solo se listan las filas activas: al borrar desde el panel, una entrada ya
// usada por visitas no se puede eliminar (hay FK por código), así que se
// desactiva. Las visitas viejas conservan su código y siguen mostrándose.

// ── Motivos ─────────────────────────────────────────────────────────────────

interface FilaMotivo {
  id: number;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export async function listarMotivos(): Promise<CatalogoMotivo[]> {
  const filas = await consulta<FilaMotivo>(
    `SELECT id, codigo, nombre, orden, activo
       FROM dmc.catalogo_motivo WHERE activo = 1 ORDER BY orden, nombre`
  );
  return filas.map((f) => ({
    id: num(f.id),
    codigo: f.codigo,
    nombre: f.nombre,
    orden: f.orden,
    activo: Boolean(f.activo),
  }));
}

export async function crearMotivo(nombre: string): Promise<CatalogoMotivo> {
  const codigo = await codigoLibre("dmc.catalogo_motivo", nombre, "MOTIVO");
  const [fila] = await consultaCon<{ id: number; orden: number }>(
    `INSERT INTO dmc.catalogo_motivo (codigo, nombre, orden)
     OUTPUT INSERTED.id AS id, INSERTED.orden AS orden
     VALUES (@codigo, @nombre, (SELECT ISNULL(MAX(orden), 0) + 1 FROM dmc.catalogo_motivo))`,
    [
      ["codigo", sql.VarChar(40), codigo],
      ["nombre", sql.NVarChar(80), nombre],
    ]
  );
  return { id: num(fila.id), codigo, nombre, orden: fila.orden, activo: true };
}

export async function renombrarMotivo(id: number, nombre: string): Promise<void> {
  await ejecutar(`UPDATE dmc.catalogo_motivo SET nombre = @nombre WHERE id = @id`, [
    ["nombre", sql.NVarChar(80), nombre],
    ["id", sql.BigInt, id],
  ]);
}

export async function eliminarMotivo(id: number): Promise<void> {
  await borrarOApagar("dmc.catalogo_motivo", id, `SELECT 1 FROM dmc.visita v
    JOIN dmc.catalogo_motivo c ON c.codigo = v.motivo_codigo WHERE c.id = @id
    UNION ALL
    SELECT 1 FROM dmc.visita_ejecucion e
    JOIN dmc.catalogo_motivo c ON c.codigo = e.motivo_real_codigo WHERE c.id = @id`);
}

// ── Tipos de problema ───────────────────────────────────────────────────────

interface FilaProblema {
  id: number;
  codigo: string;
  nombre: string;
  grupo_label: string | null;
  singular: string | null;
  ayuda: string | null;
  orden: number;
  activo: boolean;
}

interface FilaOpcion {
  id: number;
  problema_id: number;
  etiqueta: string;
  orden: number;
  activo: boolean;
}

export async function listarProblemas(): Promise<CatalogoProblema[]> {
  const [filas, opciones] = await Promise.all([
    consulta<FilaProblema>(
      `SELECT id, codigo, nombre, grupo_label, singular, ayuda, orden, activo
         FROM dmc.catalogo_problema WHERE activo = 1 ORDER BY orden, nombre`
    ),
    consulta<FilaOpcion>(
      `SELECT o.id, o.problema_id, o.etiqueta, o.orden, o.activo
         FROM dmc.catalogo_problema_opcion o WHERE o.activo = 1 ORDER BY o.orden, o.id`
    ),
  ]);

  const porProblema = agrupar(opciones, (o) => num(o.problema_id));
  return filas.map((f) => ({
    id: num(f.id),
    codigo: f.codigo,
    nombre: f.nombre,
    grupoLabel: f.grupo_label,
    singular: f.singular,
    ayuda: f.ayuda,
    orden: f.orden,
    activo: Boolean(f.activo),
    opciones: (porProblema.get(num(f.id)) ?? []).map(
      (o): CatalogoProblemaOpcion => ({
        id: num(o.id),
        problemaId: num(o.problema_id),
        etiqueta: o.etiqueta,
        orden: o.orden,
        activo: Boolean(o.activo),
      })
    ),
  }));
}

export async function crearProblema(nombre: string): Promise<CatalogoProblema> {
  const codigo = await codigoLibre("dmc.catalogo_problema", nombre, "TIPO");
  const [fila] = await consultaCon<{ id: number; orden: number }>(
    `INSERT INTO dmc.catalogo_problema (codigo, nombre, orden)
     OUTPUT INSERTED.id AS id, INSERTED.orden AS orden
     VALUES (@codigo, @nombre, (SELECT ISNULL(MAX(orden), 0) + 1 FROM dmc.catalogo_problema))`,
    [
      ["codigo", sql.VarChar(40), codigo],
      ["nombre", sql.NVarChar(80), nombre],
    ]
  );
  return {
    id: num(fila.id),
    codigo,
    nombre,
    grupoLabel: null,
    singular: null,
    ayuda: null,
    orden: fila.orden,
    activo: true,
    opciones: [],
  };
}

export async function actualizarProblemaCatalogo(
  id: number,
  campos: { nombre?: string; grupoLabel?: string | null }
): Promise<void> {
  if (campos.nombre !== undefined) {
    await ejecutar(`UPDATE dmc.catalogo_problema SET nombre = @v WHERE id = @id`, [
      ["v", sql.NVarChar(80), campos.nombre],
      ["id", sql.BigInt, id],
    ]);
  }
  if (campos.grupoLabel !== undefined) {
    await ejecutar(`UPDATE dmc.catalogo_problema SET grupo_label = @v WHERE id = @id`, [
      ["v", sql.NVarChar(60), campos.grupoLabel || null],
      ["id", sql.BigInt, id],
    ]);
  }
}

export async function eliminarProblema(id: number): Promise<void> {
  await borrarOApagar(
    "dmc.catalogo_problema",
    id,
    `SELECT 1 FROM dmc.problema p
      JOIN dmc.catalogo_problema c ON c.codigo = p.tipo_codigo WHERE c.id = @id`
  );
}

export async function crearOpcionProblema(problemaId: number, etiqueta: string): Promise<CatalogoProblemaOpcion> {
  const [fila] = await consultaCon<{ id: number; orden: number }>(
    `INSERT INTO dmc.catalogo_problema_opcion (problema_id, etiqueta, orden)
     OUTPUT INSERTED.id AS id, INSERTED.orden AS orden
     VALUES (@p, @etiqueta, (SELECT ISNULL(MAX(orden), 0) + 1
                               FROM dmc.catalogo_problema_opcion WHERE problema_id = @p))`,
    [
      ["p", sql.BigInt, problemaId],
      ["etiqueta", sql.NVarChar(80), etiqueta],
    ]
  );
  return { id: num(fila.id), problemaId, etiqueta, orden: fila.orden, activo: true };
}

export async function renombrarOpcionProblema(id: number, etiqueta: string): Promise<void> {
  await ejecutar(`UPDATE dmc.catalogo_problema_opcion SET etiqueta = @v WHERE id = @id`, [
    ["v", sql.NVarChar(80), etiqueta],
    ["id", sql.BigInt, id],
  ]);
}

export async function eliminarOpcionProblema(id: number): Promise<void> {
  // problema_item copia la etiqueta al registrar, así que no hay FK: se borra.
  await ejecutar(`DELETE FROM dmc.catalogo_problema_opcion WHERE id = @id`, [["id", sql.BigInt, id]]);
}

// ── Trabajos realizados ─────────────────────────────────────────────────────

interface FilaTrabajo {
  id: number;
  codigo: string;
  nombre: string;
  grupo_label: string | null;
  singular: string | null;
  orden: number;
  activo: boolean;
}

interface FilaSubtrabajo {
  id: number;
  trabajo_id: number;
  etiqueta: string;
  orden: number;
  activo: boolean;
}

export async function listarTrabajos(): Promise<CatalogoTrabajo[]> {
  const [filas, subs] = await Promise.all([
    consulta<FilaTrabajo>(
      `SELECT id, codigo, nombre, grupo_label, singular, orden, activo
         FROM dmc.catalogo_trabajo WHERE activo = 1 ORDER BY orden, nombre`
    ),
    consulta<FilaSubtrabajo>(
      `SELECT id, trabajo_id, etiqueta, orden, activo
         FROM dmc.catalogo_trabajo_subtrabajo WHERE activo = 1 ORDER BY orden, id`
    ),
  ]);

  const porTrabajo = agrupar(subs, (s) => num(s.trabajo_id));
  return filas.map((f) => ({
    id: num(f.id),
    codigo: f.codigo,
    nombre: f.nombre,
    grupoLabel: f.grupo_label,
    singular: f.singular,
    orden: f.orden,
    activo: Boolean(f.activo),
    subtrabajos: (porTrabajo.get(num(f.id)) ?? []).map(
      (s): CatalogoTrabajoSubtrabajo => ({
        id: num(s.id),
        trabajoId: num(s.trabajo_id),
        etiqueta: s.etiqueta,
        orden: s.orden,
        activo: Boolean(s.activo),
      })
    ),
  }));
}

export async function crearTrabajo(nombre: string): Promise<CatalogoTrabajo> {
  const codigo = await codigoLibre("dmc.catalogo_trabajo", nombre, "TRABAJO");
  const [fila] = await consultaCon<{ id: number; orden: number }>(
    `INSERT INTO dmc.catalogo_trabajo (codigo, nombre, orden)
     OUTPUT INSERTED.id AS id, INSERTED.orden AS orden
     VALUES (@codigo, @nombre, (SELECT ISNULL(MAX(orden), 0) + 1 FROM dmc.catalogo_trabajo))`,
    [
      ["codigo", sql.VarChar(40), codigo],
      ["nombre", sql.NVarChar(80), nombre],
    ]
  );
  return {
    id: num(fila.id),
    codigo,
    nombre,
    grupoLabel: null,
    singular: null,
    orden: fila.orden,
    activo: true,
    subtrabajos: [],
  };
}

export async function actualizarTrabajoCatalogo(
  id: number,
  campos: { nombre?: string; grupoLabel?: string | null }
): Promise<void> {
  if (campos.nombre !== undefined) {
    await ejecutar(`UPDATE dmc.catalogo_trabajo SET nombre = @v WHERE id = @id`, [
      ["v", sql.NVarChar(80), campos.nombre],
      ["id", sql.BigInt, id],
    ]);
  }
  if (campos.grupoLabel !== undefined) {
    await ejecutar(`UPDATE dmc.catalogo_trabajo SET grupo_label = @v WHERE id = @id`, [
      ["v", sql.NVarChar(60), campos.grupoLabel || null],
      ["id", sql.BigInt, id],
    ]);
  }
}

export async function eliminarTrabajo(id: number): Promise<void> {
  await borrarOApagar(
    "dmc.catalogo_trabajo",
    id,
    `SELECT 1 FROM dmc.visita_trabajo w
      JOIN dmc.catalogo_trabajo c ON c.codigo = w.trabajo_codigo WHERE c.id = @id`
  );
}

export async function crearSubtrabajo(trabajoId: number, etiqueta: string): Promise<CatalogoTrabajoSubtrabajo> {
  const [fila] = await consultaCon<{ id: number; orden: number }>(
    `INSERT INTO dmc.catalogo_trabajo_subtrabajo (trabajo_id, etiqueta, orden)
     OUTPUT INSERTED.id AS id, INSERTED.orden AS orden
     VALUES (@t, @etiqueta, (SELECT ISNULL(MAX(orden), 0) + 1
                               FROM dmc.catalogo_trabajo_subtrabajo WHERE trabajo_id = @t))`,
    [
      ["t", sql.BigInt, trabajoId],
      ["etiqueta", sql.NVarChar(80), etiqueta],
    ]
  );
  return { id: num(fila.id), trabajoId, etiqueta, orden: fila.orden, activo: true };
}

export async function renombrarSubtrabajo(id: number, etiqueta: string): Promise<void> {
  await ejecutar(`UPDATE dmc.catalogo_trabajo_subtrabajo SET etiqueta = @v WHERE id = @id`, [
    ["v", sql.NVarChar(80), etiqueta],
    ["id", sql.BigInt, id],
  ]);
}

export async function eliminarSubtrabajo(id: number): Promise<void> {
  await ejecutar(`DELETE FROM dmc.catalogo_trabajo_subtrabajo WHERE id = @id`, [["id", sql.BigInt, id]]);
}

// ── Catálogo de fábrica ─────────────────────────────────────────────────────

/**
 * Repone las tres listas de fábrica. Es idempotente: inserta lo que falta,
 * reactiva lo desactivado y devuelve nombres y opciones a su valor original,
 * sin tocar lo que el panel haya agregado por su cuenta.
 *
 * También es la forma de dejar operativa una base recién creada: sin motivos
 * no se puede programar una visita (dmc.visita tiene FK contra el catálogo).
 */
export async function restaurarCatalogoFabrica(): Promise<{ motivos: number; problemas: number; trabajos: number }> {
  for (const m of MOTIVOS_FABRICA) {
    await ejecutar(
      `MERGE dmc.catalogo_motivo AS destino
       USING (SELECT @codigo AS codigo) AS origen ON destino.codigo = origen.codigo
       WHEN MATCHED THEN UPDATE SET nombre = @nombre, orden = @orden, activo = 1
       WHEN NOT MATCHED THEN INSERT (codigo, nombre, orden) VALUES (@codigo, @nombre, @orden);`,
      [
        ["codigo", sql.VarChar(40), m.codigo],
        ["nombre", sql.NVarChar(80), m.nombre],
        ["orden", sql.SmallInt, m.orden],
      ]
    );
  }

  for (const p of PROBLEMAS_FABRICA) {
    await ejecutar(
      `MERGE dmc.catalogo_problema AS destino
       USING (SELECT @codigo AS codigo) AS origen ON destino.codigo = origen.codigo
       WHEN MATCHED THEN UPDATE SET nombre = @nombre, grupo_label = @grupo, singular = @singular,
                                    ayuda = @ayuda, orden = @orden, activo = 1
       WHEN NOT MATCHED THEN INSERT (codigo, nombre, grupo_label, singular, ayuda, orden)
                             VALUES (@codigo, @nombre, @grupo, @singular, @ayuda, @orden);`,
      [
        ["codigo", sql.VarChar(40), p.codigo],
        ["nombre", sql.NVarChar(80), p.nombre],
        ["grupo", sql.NVarChar(60), p.grupoLabel],
        ["singular", sql.NVarChar(30), p.singular],
        ["ayuda", sql.NVarChar(160), p.ayuda],
        ["orden", sql.SmallInt, p.orden],
      ]
    );
    for (const [i, etiqueta] of p.opciones.entries()) {
      await ejecutar(
        `MERGE dmc.catalogo_problema_opcion AS destino
         USING (SELECT c.id AS problema_id, @etiqueta AS etiqueta
                  FROM dmc.catalogo_problema c WHERE c.codigo = @codigo) AS origen
            ON destino.problema_id = origen.problema_id AND destino.etiqueta = origen.etiqueta
         WHEN MATCHED THEN UPDATE SET orden = @orden, activo = 1
         WHEN NOT MATCHED THEN INSERT (problema_id, etiqueta, orden)
                               VALUES (origen.problema_id, origen.etiqueta, @orden);`,
        [
          ["codigo", sql.VarChar(40), p.codigo],
          ["etiqueta", sql.NVarChar(80), etiqueta],
          ["orden", sql.SmallInt, i + 1],
        ]
      );
    }
  }

  for (const t of TRABAJOS_FABRICA) {
    await ejecutar(
      `MERGE dmc.catalogo_trabajo AS destino
       USING (SELECT @codigo AS codigo) AS origen ON destino.codigo = origen.codigo
       WHEN MATCHED THEN UPDATE SET nombre = @nombre, grupo_label = @grupo, singular = @singular,
                                    orden = @orden, activo = 1
       WHEN NOT MATCHED THEN INSERT (codigo, nombre, grupo_label, singular, orden)
                             VALUES (@codigo, @nombre, @grupo, @singular, @orden);`,
      [
        ["codigo", sql.VarChar(40), t.codigo],
        ["nombre", sql.NVarChar(80), t.nombre],
        ["grupo", sql.NVarChar(60), t.grupoLabel],
        ["singular", sql.NVarChar(30), t.singular],
        ["orden", sql.SmallInt, t.orden],
      ]
    );
    for (const [i, etiqueta] of t.subtrabajos.entries()) {
      await ejecutar(
        `MERGE dmc.catalogo_trabajo_subtrabajo AS destino
         USING (SELECT c.id AS trabajo_id, @etiqueta AS etiqueta
                  FROM dmc.catalogo_trabajo c WHERE c.codigo = @codigo) AS origen
            ON destino.trabajo_id = origen.trabajo_id AND destino.etiqueta = origen.etiqueta
         WHEN MATCHED THEN UPDATE SET orden = @orden, activo = 1
         WHEN NOT MATCHED THEN INSERT (trabajo_id, etiqueta, orden)
                               VALUES (origen.trabajo_id, origen.etiqueta, @orden);`,
        [
          ["codigo", sql.VarChar(40), t.codigo],
          ["etiqueta", sql.NVarChar(80), etiqueta],
          ["orden", sql.SmallInt, i + 1],
        ]
      );
    }
  }

  return {
    motivos: MOTIVOS_FABRICA.length,
    problemas: PROBLEMAS_FABRICA.length,
    trabajos: TRABAJOS_FABRICA.length,
  };
}

// ── Apoyo ───────────────────────────────────────────────────────────────────

/** Convierte "Cable dañado" en CABLE_DANADO. */
function normalizarCodigo(nombre: string, respaldo: string): string {
  const base =
    (nombre || respaldo)
      .toUpperCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 28) || respaldo;
  return base;
}

/** Código derivado del nombre, con sufijo numérico si el original ya existe. */
async function codigoLibre(tabla: string, nombre: string, respaldo: string): Promise<string> {
  const base = normalizarCodigo(nombre, respaldo);
  const usados = await consultaCon<{ codigo: string }>(
    `SELECT codigo FROM ${tabla} WHERE codigo = @base OR codigo LIKE @patron`,
    [
      ["base", sql.VarChar(40), base],
      ["patron", sql.VarChar(40), `${base}\\_%`],
    ]
  );
  const set = new Set(usados.map((u) => u.codigo));
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/**
 * Borra la fila del catálogo; si ya está referenciada por datos históricos la
 * desactiva. El panel promete que "las visitas ya registradas no se modifican",
 * y un DELETE contra una FK en uso reventaría la acción.
 */
async function borrarOApagar(tabla: string, id: number, consultaUso: string): Promise<void> {
  const usos = await consultaCon<{ x: number }>(`SELECT TOP 1 1 AS x FROM (${consultaUso}) AS u(x)`, [
    ["id", sql.BigInt, id],
  ]);
  if (usos.length > 0) {
    await ejecutar(`UPDATE ${tabla} SET activo = 0 WHERE id = @id`, [["id", sql.BigInt, id]]);
    return;
  }
  await ejecutar(`DELETE FROM ${tabla} WHERE id = @id`, [["id", sql.BigInt, id]]);
}
