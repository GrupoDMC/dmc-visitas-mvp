import "server-only";
import { enTransaccion, num, paramIds, sql, subIds, type Ejecutor, type Parametro } from "@/lib/data/sql";
import { ESTADO_PROBLEMA_CIERRE, ESTADO_PROBLEMA_INICIAL } from "@/lib/ui/estado";
import type {
  BorradorChecklist,
  ItemBorrador,
  MotivoBorrador,
  MotivoConTrabajos,
  ResumenChecklist,
} from "@/lib/contratos/checklist";
import {
  listarCargos,
  listarEstadosProblema,
  listarGestionProblemas,
  listarInternos,
  listarPendientes,
} from "@/lib/data/catalogos-lectura";

// Las listas del checklist: el guardado en bloque. Dos reglas que valen para
// todo este archivo:
//
// 1. NADA SE BORRA. Quitar una entrada la deja con activo = 0. Las visitas y
//    las actas ya registradas apuntan a ella por código y tienen que seguir
//    mostrándose tal como se firmaron.
// 2. El panel no guarda letra por letra: arma un borrador completo y lo manda
//    de una sola vez con guardarChecklist(). Así el orden, los nombres, las
//    altas y las bajas quedan consistentes entre sí o no queda nada.

// ── Guardado en bloque ──────────────────────────────────────────────────────

/**
 * Escribe el borrador completo del panel.
 *
 * El orden de cada lista es el orden del arreglo: la posición manda, así que
 * arrastrar una fila y guardar es todo lo que hace falta para reordenar.
 *
 * Lo que estaba activo en la base y no viene en el borrador se desactiva. No se
 * borra ninguna fila: los códigos siguen referenciados por visitas y actas.
 */
export async function guardarChecklist(borrador: BorradorChecklist): Promise<ResumenChecklist> {
  // Son decenas de sentencias sobre siete tablas: o queda el borrador entero o
  // no queda nada. Si se cae a la mitad, un checklist con los motivos nuevos y
  // los trabajos viejos es peor que el checklist de antes.
  return enTransaccion((ej) => guardarChecklistEn(ej, borrador));
}

async function guardarChecklistEn(ej: Ejecutor, borrador: BorradorChecklist): Promise<ResumenChecklist> {
  let desactivados = 0;

  // ── Motivos ──
  const motivos = await guardarListaSimple(ej, "dmc.catalogo_motivo", borrador.motivos, "MOTIVO");
  const vivosMotivo = motivos.vivos;
  desactivados += motivos.desactivados;

  // ── Tipos de problema ──
  const padresProblema = await padresExistentes(ej, "dmc.catalogo_problema");
  const vivosProblema: number[] = [];
  for (const [i, p] of borrador.problemas.entries()) {
    const nombre = p.nombre.trim();
    if (!nombre) continue;
    const resuelto = resolverPadre(padresProblema, p.id, nombre, "TIPO");
    let id = resuelto.id;
    if (resuelto.esNuevo) {
      const [fila] = await ej.consulta<{ id: number }>(
        `INSERT INTO dmc.catalogo_problema (codigo, nombre, grupo_label, orden, activo)
         OUTPUT INSERTED.id AS id VALUES (@codigo, @nombre, @grupo, @orden, 1)`,
        [
          ["codigo", sql.VarChar(40), resuelto.codigo],
          ["nombre", sql.NVarChar(80), nombre],
          ["grupo", sql.NVarChar(60), p.grupoLabel || null],
          ["orden", sql.SmallInt, i + 1],
        ]
      );
      id = num(fila.id);
    } else {
      await ej.ejecutar(
        `UPDATE dmc.catalogo_problema
            SET nombre = @nombre, grupo_label = @grupo, orden = @orden, activo = 1
          WHERE id = @id`,
        [
          ["nombre", sql.NVarChar(80), nombre],
          ["grupo", sql.NVarChar(60), p.grupoLabel || null],
          ["orden", sql.SmallInt, i + 1],
          ["id", sql.BigInt, id],
        ]
      );
    }
    vivosProblema.push(id);
    desactivados += await guardarHijos(
      ej,
      "dmc.catalogo_problema_opcion",
      "problema_id",
      id,
      p.opciones
    );
  }
  desactivados += await desactivarSobrantes(ej, "dmc.catalogo_problema", vivosProblema);

  // ── Trabajos realizados ──
  const padresTrabajo = await padresExistentes(ej, "dmc.catalogo_trabajo");
  const vivosTrabajo: number[] = [];
  const trabajoPorNombre = new Map<string, number>();
  for (const [i, t] of borrador.trabajos.entries()) {
    const nombre = t.nombre.trim();
    if (!nombre) continue;
    const resuelto = resolverPadre(padresTrabajo, t.id, nombre, "TRABAJO");
    let id = resuelto.id;
    if (resuelto.esNuevo) {
      const [fila] = await ej.consulta<{ id: number }>(
        `INSERT INTO dmc.catalogo_trabajo (codigo, nombre, grupo_label, orden, activo)
         OUTPUT INSERTED.id AS id VALUES (@codigo, @nombre, @grupo, @orden, 1)`,
        [
          ["codigo", sql.VarChar(40), resuelto.codigo],
          ["nombre", sql.NVarChar(80), nombre],
          ["grupo", sql.NVarChar(60), t.grupoLabel || null],
          ["orden", sql.SmallInt, i + 1],
        ]
      );
      id = num(fila.id);
    } else {
      await ej.ejecutar(
        `UPDATE dmc.catalogo_trabajo
            SET nombre = @nombre, grupo_label = @grupo, orden = @orden, activo = 1
          WHERE id = @id`,
        [
          ["nombre", sql.NVarChar(80), nombre],
          ["grupo", sql.NVarChar(60), t.grupoLabel || null],
          ["orden", sql.SmallInt, i + 1],
          ["id", sql.BigInt, id],
        ]
      );
    }
    vivosTrabajo.push(id);
    trabajoPorNombre.set(nombre.toLowerCase(), id);
    desactivados += await guardarHijos(
      ej,
      "dmc.catalogo_trabajo_subtrabajo",
      "trabajo_id",
      id,
      t.subtrabajos
    );
  }
  desactivados += await desactivarSobrantes(ej, "dmc.catalogo_trabajo", vivosTrabajo);

  // ── Qué trabajos van en cada motivo ──
  await guardarTrabajosPorMotivo(ej, borrador.motivos, motivos.idPorNombre, trabajoPorNombre);

  // ── Secciones de motivos y de trabajos ──
  await guardarSecciones(ej, borrador, motivos.idPorNombre, trabajoPorNombre);

  // ── Checklist del comentario interno ──
  // Sin la lista en el borrador (un panel viejo todavía abierto) no se toca:
  // si no, guardar los motivos vaciaría el checklist interno.
  let vivosInterno: number;
  if (borrador.internos) {
    const internos = await guardarListaSimple(ej, "dmc.catalogo_interno", borrador.internos, "INTERNO");
    vivosInterno = internos.vivos.length;
    desactivados += internos.desactivados;
  } else {
    vivosInterno = (await listarInternos()).length;
  }

  // ── Checklist de gestión de pendientes ──
  // Igual que el interno: sin la lista en el borrador no se toca.
  let vivosPendiente: number;
  if (borrador.pendientes) {
    const pendientes = await guardarListaSimple(ej, "dmc.catalogo_pendiente", borrador.pendientes, "PENDIENTE");
    vivosPendiente = pendientes.vivos.length;
    desactivados += pendientes.desactivados;
  } else {
    vivosPendiente = (await listarPendientes()).length;
  }

  // ── Cargos del responsable ── (misma regla)
  let vivosCargo: number;
  if (borrador.cargos) {
    const cargos = await guardarListaSimple(ej, "dmc.catalogo_cargo", borrador.cargos, "CARGO");
    vivosCargo = cargos.vivos.length;
    desactivados += cargos.desactivados;
  } else {
    vivosCargo = (await listarCargos()).length;
  }

  // ── Checklist de gestión de problemas ── (misma regla)
  let vivosGestionProblema: number;
  if (borrador.gestionProblemas) {
    const gestion = await guardarListaSimple(ej, "dmc.catalogo_problema_gestion", borrador.gestionProblemas, "GESTION");
    vivosGestionProblema = gestion.vivos.length;
    desactivados += gestion.desactivados;
  } else {
    vivosGestionProblema = (await listarGestionProblemas()).length;
  }

  // ── Estados del problema ── (misma regla)
  let vivosEstado: number;
  if (borrador.estadosProblema) {
    const estados = await guardarEstadosProblema(ej, borrador.estadosProblema);
    vivosEstado = estados.vivos;
    desactivados += estados.desactivados;
  } else {
    vivosEstado = (await listarEstadosProblema()).filter((e) => e.activo).length;
  }

  return {
    motivos: vivosMotivo.length,
    problemas: vivosProblema.length,
    trabajos: vivosTrabajo.length,
    internos: vivosInterno,
    pendientes: vivosPendiente,
    cargos: vivosCargo,
    gestionProblemas: vivosGestionProblema,
    estadosProblema: vivosEstado,
    desactivados,
  };
}

/**
 * Escribe las secciones de motivos y de trabajos y deja a cada entrada en la
 * suya. La posición en la lista es el orden; una sección que no viene se
 * desactiva (sus entradas quedan «sin sección») y nada se borra.
 */
async function guardarSecciones(
  ej: Ejecutor,
  borrador: BorradorChecklist,
  motivoPorNombre: Map<string, number>,
  trabajoPorNombre: Map<string, number>
): Promise<void> {
  await guardarSeccionesDe(ej, "MOTIVO", "dmc.catalogo_motivo", borrador.seccionesMotivo, borrador.motivos, motivoPorNombre);
  await guardarSeccionesDe(
    ej,
    "TRABAJO",
    "dmc.catalogo_trabajo",
    borrador.seccionesTrabajo,
    borrador.trabajos,
    trabajoPorNombre
  );
}

async function guardarSeccionesDe(
  ej: Ejecutor,
  tipo: "MOTIVO" | "TRABAJO",
  tabla: "dmc.catalogo_motivo" | "dmc.catalogo_trabajo",
  nombres: string[] | undefined,
  items: { nombre: string; seccion?: string | null }[],
  idPorNombre: Map<string, number>
): Promise<void> {
  // Sin la lista en el borrador (un panel viejo todavía abierto) no se toca.
  if (!nombres) return;

  const existentes = await ej.consulta<{ id: number; nombre: string }>(
    `SELECT id, nombre FROM dmc.catalogo_seccion WHERE tipo = @tipo`,
    [["tipo", sql.VarChar(10), tipo]]
  );
  const previas = new Map(existentes.map((f) => [f.nombre.trim().toLowerCase(), num(f.id)]));
  const idPorSeccion = new Map<string, number>();
  const vivas: number[] = [];

  for (const [i, bruto] of nombres.entries()) {
    const nombre = bruto.trim();
    const clave = nombre.toLowerCase();
    if (!nombre || idPorSeccion.has(clave)) continue;
    const previa = previas.get(clave);
    let id: number;
    if (previa !== undefined) {
      await ej.ejecutar(`UPDATE dmc.catalogo_seccion SET nombre = @nombre, orden = @orden, activo = 1 WHERE id = @id`, [
        ["nombre", sql.NVarChar(80), nombre],
        ["orden", sql.SmallInt, i + 1],
        ["id", sql.BigInt, previa],
      ]);
      id = previa;
    } else {
      const [fila] = await ej.consulta<{ id: number }>(
        `INSERT INTO dmc.catalogo_seccion (tipo, nombre, orden, activo)
         OUTPUT INSERTED.id AS id VALUES (@tipo, @nombre, @orden, 1)`,
        [
          ["tipo", sql.VarChar(10), tipo],
          ["nombre", sql.NVarChar(80), nombre],
          ["orden", sql.SmallInt, i + 1],
        ]
      );
      id = num(fila.id);
    }
    idPorSeccion.set(clave, id);
    vivas.push(id);
  }
  await desactivarSobrantes(ej, "dmc.catalogo_seccion", vivas, {
    sql: "tipo = @tipo",
    params: [["tipo", sql.VarChar(10), tipo]],
  });

  // Cada entrada, en su sección. Un UPDATE por sección y no uno por entrada.
  const entero = (n: number | undefined): n is number => n !== undefined && Number.isSafeInteger(n) && n > 0;
  const porSeccion = new Map<number | null, number[]>();
  for (const item of items) {
    const id = idPorNombre.get(item.nombre.trim().toLowerCase());
    if (!entero(id)) continue;
    const seccion = item.seccion?.trim() ? (idPorSeccion.get(item.seccion.trim().toLowerCase()) ?? null) : null;
    porSeccion.set(seccion, [...(porSeccion.get(seccion) ?? []), id]);
  }
  for (const [seccion, ids] of porSeccion) {
    // `tabla` sale de la unión de literales del parámetro: nunca de la entrada.
    await ej.ejecutar(`UPDATE ${tabla} SET seccion_id = @seccion WHERE id IN ${subIds("ids")}`, [
      ["seccion", sql.BigInt, seccion],
      paramIds("ids", ids),
    ]);
  }
}

/**
 * Reescribe los enlaces motivo → trabajo de cada motivo del borrador, con la
 * posición de cada trabajo dentro del motivo como orden. Los motivos que se
 * desactivaron conservan sus enlaces: si vuelven, vuelven con sus trabajos.
 *
 * Va en dos sentencias y no en una por enlace: con 20 motivos de 5 trabajos
 * serían 100 idas y vueltas al servidor. Los enlaces viajan como un parámetro
 * JSON y se leen con OPENJSON.
 */
async function guardarTrabajosPorMotivo(
  ej: Ejecutor,
  motivos: MotivoConTrabajos[],
  motivoPorNombre: Map<string, number>,
  trabajoPorNombre: Map<string, number>
): Promise<void> {
  const entero = (n: number | undefined): n is number => n !== undefined && Number.isSafeInteger(n) && n > 0;
  const tocados: number[] = [];
  const enlaces: { m: number; t: number; o: number }[] = [];
  for (const m of motivos) {
    const motivoId = motivoPorNombre.get(m.nombre.trim().toLowerCase());
    if (!entero(motivoId)) continue;
    tocados.push(motivoId);
    const vistos = new Set<number>();
    for (const nombre of m.trabajos ?? []) {
      const trabajoId = trabajoPorNombre.get(nombre.trim().toLowerCase());
      if (!entero(trabajoId) || vistos.has(trabajoId)) continue;
      vistos.add(trabajoId);
      enlaces.push({ m: motivoId, t: trabajoId, o: vistos.size });
    }
  }
  if (!tocados.length) return;

  await ej.ejecutar(`DELETE FROM dmc.catalogo_motivo_trabajo WHERE motivo_id IN ${subIds("tocados")}`, [
    paramIds("tocados", tocados),
  ]);
  if (!enlaces.length) return;
  await ej.ejecutar(
    `INSERT INTO dmc.catalogo_motivo_trabajo (motivo_id, trabajo_id, orden)
     SELECT m, t, o
       FROM OPENJSON(@enlaces) WITH (m bigint '$.m', t bigint '$.t', o smallint '$.o')`,
    [["enlaces", sql.NVarChar(sql.MAX), JSON.stringify(enlaces)]]
  );
}

/**
 * Motivos, checklist interno y las dos listas de gestión: todas son una
 * lista plana de (codigo, nombre, orden, activo), así que se guardan igual.
 */
async function guardarListaSimple(
  ej: Ejecutor,
  // `tabla` se interpola en el texto: por eso es una unión cerrada de literales.
  tabla:
    | "dmc.catalogo_motivo"
    | "dmc.catalogo_interno"
    | "dmc.catalogo_pendiente"
    | "dmc.catalogo_cargo"
    | "dmc.catalogo_problema_gestion",
  items: MotivoBorrador[],
  respaldo: string
): Promise<{ vivos: number[]; idPorNombre: Map<string, number>; desactivados: number }> {
  const padres = await padresExistentes(ej, tabla);
  const vivos: number[] = [];
  const idPorNombre = new Map<string, number>();
  for (const [i, m] of items.entries()) {
    const nombre = m.nombre.trim();
    if (!nombre) continue;
    const resuelto = resolverPadre(padres, m.id, nombre, respaldo);
    let id = resuelto.id;
    if (resuelto.esNuevo) {
      const [fila] = await ej.consulta<{ id: number }>(
        `INSERT INTO ${tabla} (codigo, nombre, orden, activo)
         OUTPUT INSERTED.id AS id VALUES (@codigo, @nombre, @orden, 1)`,
        [
          ["codigo", sql.VarChar(40), resuelto.codigo],
          ["nombre", sql.NVarChar(80), nombre],
          ["orden", sql.SmallInt, i + 1],
        ]
      );
      id = num(fila.id);
    } else {
      await ej.ejecutar(`UPDATE ${tabla} SET nombre = @nombre, orden = @orden, activo = 1 WHERE id = @id`, [
        ["nombre", sql.NVarChar(80), nombre],
        ["orden", sql.SmallInt, i + 1],
        ["id", sql.BigInt, id],
      ]);
    }
    vivos.push(id);
    idPorNombre.set(nombre.toLowerCase(), id);
  }
  const desactivados = await desactivarSobrantes(ej, tabla, vivos);
  return { vivos, idPorNombre, desactivados };
}

/**
 * Subdetalles y subtrabajos: las dos tablas hijas tienen la misma forma
 * (padre, etiqueta, orden, permite_cantidad, activo), así que comparten código.
 *
 * Si el nombre choca con una fila ya desactivada del mismo padre se reactiva
 * esa en vez de insertar: la restricción de unicidad es (padre, etiqueta) y
 * cuenta también lo inactivo.
 */
async function guardarHijos(
  ej: Ejecutor,
  // Nombres de tabla y de columna interpolados: solo los dos pares de literales
  // con que lo llama guardarChecklist, nunca algo que venga del navegador.
  tabla: "dmc.catalogo_problema_opcion" | "dmc.catalogo_trabajo_subtrabajo",
  columnaPadre: "problema_id" | "trabajo_id",
  padreId: number,
  items: ItemBorrador[]
): Promise<number> {
  // Los ids que de verdad cuelgan de este padre. Uno que no esté acá se trata
  // como alta: no se escribe sobre la fila de otro trabajo por un id inventado.
  const existentes = await ej.consulta<{ id: number }>(`SELECT id FROM ${tabla} WHERE ${columnaPadre} = @padre`, [
    ["padre", sql.BigInt, padreId],
  ]);
  const idsHijos = new Set(existentes.map((f) => num(f.id)));
  const vivos: number[] = [];
  for (const [i, item] of items.entries()) {
    const etiqueta = item.etiqueta.trim();
    if (!etiqueta) continue;

    if (item.id !== null && idsHijos.has(item.id)) {
      await ej.ejecutar(
        `UPDATE ${tabla}
            SET etiqueta = @etiqueta, orden = @orden, permite_cantidad = @cantidad, activo = 1
          WHERE id = @id`,
        [
          ["etiqueta", sql.NVarChar(80), etiqueta],
          ["orden", sql.SmallInt, i + 1],
          ["cantidad", sql.Bit, item.permiteCantidad],
          ["id", sql.BigInt, item.id],
        ]
      );
      vivos.push(item.id);
      continue;
    }

    const [fila] = await ej.consulta<{ id: number }>(
      `DECLARE @salida TABLE (id bigint);

       UPDATE ${tabla}
          SET orden = @orden, permite_cantidad = @cantidad, activo = 1
       OUTPUT INSERTED.id INTO @salida
        WHERE ${columnaPadre} = @padre AND etiqueta = @etiqueta;

       IF NOT EXISTS (SELECT 1 FROM @salida)
         INSERT INTO ${tabla} (${columnaPadre}, etiqueta, orden, permite_cantidad, activo)
         OUTPUT INSERTED.id INTO @salida
         VALUES (@padre, @etiqueta, @orden, @cantidad, 1);

       SELECT id FROM @salida;`,
      [
        ["padre", sql.BigInt, padreId],
        ["etiqueta", sql.NVarChar(80), etiqueta],
        ["orden", sql.SmallInt, i + 1],
        ["cantidad", sql.Bit, item.permiteCantidad],
      ]
    );
    if (fila) vivos.push(num(fila.id));
  }

  return desactivarSobrantes(ej, tabla, vivos, {
    sql: `${columnaPadre} = @padre_filtro`,
    params: [["padre_filtro", sql.BigInt, padreId]],
  });
}

/**
 * Apaga lo que quedó fuera del borrador. Devuelve cuántas filas cambiaron.
 *
 * Los ids a conservar viajan como parámetro JSON. `tabla` y el texto de `donde`
 * se interpolan: salen de literales del código (sus valores variables van en
 * `donde.params`), nunca de la entrada.
 */
async function desactivarSobrantes(
  ej: Ejecutor,
  tabla: string,
  vivos: number[],
  donde: { sql: string; params: Parametro[] } = { sql: "1 = 1", params: [] }
): Promise<number> {
  return ej.ejecutar(`UPDATE ${tabla} SET activo = 0 WHERE ${donde.sql} AND activo = 1 AND id NOT IN ${subIds("vivos")}`, [
    ...donde.params,
    paramIds("vivos", vivos),
  ]);
}

/** "En cotización" → EN_COTIZAC: el código cabe en dmc.problema.estado, que mide 10. */
function codigoDeEstado(nombre: string, usados: Set<string>): string {
  const base =
    nombre
      .toUpperCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "ESTADO";
  let codigo = base.slice(0, 10).replace(/_$/, "");
  let n = 2;
  while (usados.has(codigo)) {
    const sufijo = `_${n}`;
    codigo = base.slice(0, 10 - sufijo.length).replace(/_$/, "") + sufijo;
    n += 1;
  }
  usados.add(codigo);
  return codigo;
}

/**
 * Guarda la Lista 7. Igual que las otras: la posición es el orden, lo que no
 * viene se desactiva y nada se borra. La diferencia es que ABIERTO y RESUELTO
 * nunca se desactivan, aunque el borrador no los traiga: el primero es con el
 * que nace un problema y el segundo es el que lo cierra.
 */
async function guardarEstadosProblema(
  ej: Ejecutor,
  items: MotivoBorrador[]
): Promise<{ vivos: number; desactivados: number }> {
  const filas = await ej.consulta<{ id: number; codigo: string; nombre: string }>(
    `SELECT id, codigo, nombre FROM dmc.catalogo_problema_estado`
  );
  const ids = new Set(filas.map((f) => num(f.id)));
  const porNombre = new Map(filas.map((f) => [f.nombre.trim().toLowerCase(), num(f.id)]));
  const codigos = new Set(filas.map((f) => f.codigo));
  const vivos: number[] = [];

  for (const [i, item] of items.entries()) {
    const nombre = item.nombre.trim();
    if (!nombre) continue;
    // El id llega del navegador: si no existe, se busca por nombre (un estado
    // quitado antes se reactiva en vez de chocar con la unicidad).
    const previo = item.id !== null && ids.has(item.id) ? item.id : porNombre.get(nombre.toLowerCase());
    if (previo !== undefined && !vivos.includes(previo)) {
      await ej.ejecutar(
        `UPDATE dmc.catalogo_problema_estado SET nombre = @nombre, orden = @orden, activo = 1 WHERE id = @id`,
        [
          ["nombre", sql.NVarChar(80), nombre],
          ["orden", sql.SmallInt, i + 1],
          ["id", sql.BigInt, previo],
        ]
      );
      vivos.push(previo);
      continue;
    }
    const [fila] = await ej.consulta<{ id: number }>(
      `INSERT INTO dmc.catalogo_problema_estado (codigo, nombre, orden, activo)
       OUTPUT INSERTED.id AS id VALUES (@codigo, @nombre, @orden, 1)`,
      [
        ["codigo", sql.VarChar(10), codigoDeEstado(nombre, codigos)],
        ["nombre", sql.NVarChar(80), nombre],
        ["orden", sql.SmallInt, i + 1],
      ]
    );
    vivos.push(num(fila.id));
  }

  const desactivados = await ej.ejecutar(
    `UPDATE dmc.catalogo_problema_estado SET activo = 0
      WHERE activo = 1 AND id NOT IN ${subIds("vivos")}
        AND codigo NOT IN (@inicial, @cierre)`,
    [
      paramIds("vivos", vivos),
      ["inicial", sql.VarChar(10), ESTADO_PROBLEMA_INICIAL],
      ["cierre", sql.VarChar(10), ESTADO_PROBLEMA_CIERRE],
    ]
  );
  const [cuenta] = await ej.consulta<{ n: number }>(
    `SELECT COUNT(*) AS n FROM dmc.catalogo_problema_estado WHERE activo = 1`
  );
  return { vivos: num(cuenta?.n ?? 0), desactivados };
}

// ── Apoyo ───────────────────────────────────────────────────────────────────

/**
 * El `codigo` de las tres tablas de catálogo es la llave estable con la que las
 * visitas y las actas apuntan a la entrada: dmc.visita.motivo_codigo,
 * dmc.visita_trabajo.trabajo_codigo y dmc.problema.tipo_codigo son claves
 * foráneas contra él. Por eso se genera solo a partir del nombre y NUNCA se
 * cambia al renombrar: si mutara, un acta firmada hace un año dejaría de poder
 * decir qué trabajo se hizo.
 */
interface PadresExistentes {
  /** Todas las filas de la tabla, activas e inactivas, por nombre en minuscula. */
  porNombre: Map<string, number>;
  /** Los ids que existen de verdad, para no fiarse del que manda el navegador. */
  ids: Set<number>;
  codigos: Set<string>;
  /** Ids ya usados en este mismo guardado, para no reciclar dos veces el mismo. */
  tomados: Set<number>;
}

// `tabla` es siempre un literal de este módulo.
async function padresExistentes(ej: Ejecutor, tabla: string): Promise<PadresExistentes> {
  const filas = await ej.consulta<{ id: number; codigo: string; nombre: string }>(
    `SELECT id, codigo, nombre FROM ${tabla}`
  );
  const porNombre = new Map<string, number>();
  for (const f of filas) porNombre.set(f.nombre.trim().toLowerCase(), num(f.id));
  return {
    porNombre,
    ids: new Set(filas.map((f) => num(f.id))),
    codigos: new Set(filas.map((f) => f.codigo)),
    tomados: new Set(),
  };
}

/**
 * Decide contra que fila se escribe una entrada del borrador.
 *
 * Si el borrador trae id, se usa ese. Si no, y ya existe una fila con el mismo
 * nombre (tipicamente una que se desactivo antes), se reactiva esa en vez de
 * insertar: el nombre es UNIQUE en las tres tablas y cuenta tambien lo
 * inactivo, asi que un INSERT reventaria.
 */
function resolverPadre(
  existentes: PadresExistentes,
  id: number | null,
  nombre: string,
  respaldo: string
): { id: number; esNuevo: false } | { id: number; esNuevo: true; codigo: string } {
  // El id llega del navegador: si no corresponde a ninguna fila de esta tabla
  // se ignora y se trata como alta, en vez de escribir sobre lo que toque.
  if (id !== null && existentes.ids.has(id)) {
    existentes.tomados.add(id);
    return { id, esNuevo: false };
  }
  const previo = existentes.porNombre.get(nombre.trim().toLowerCase());
  if (previo !== undefined && !existentes.tomados.has(previo)) {
    existentes.tomados.add(previo);
    return { id: previo, esNuevo: false };
  }
  return { id: 0, esNuevo: true, codigo: codigoLibre(existentes.codigos, nombre, respaldo) };
}

/** Convierte "Cable dañado" en CABLE_DANADO. */
function normalizarCodigo(nombre: string, respaldo: string): string {
  return (
    (nombre || respaldo)
      .toUpperCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 28) || respaldo
  );
}

/** Código derivado del nombre, con sufijo numérico si el original ya existe. */
function codigoLibre(usados: Set<string>, nombre: string, respaldo: string): string {
  const base = normalizarCodigo(nombre, respaldo);
  let codigo = base;
  let n = 2;
  while (usados.has(codigo)) {
    codigo = `${base}_${n}`;
    n += 1;
  }
  usados.add(codigo);
  return codigo;
}
