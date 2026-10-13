import "server-only";
import { log } from "@/lib/log";
import {
  agrupar,
  consulta,
  consultaCon,
  ejecutar,
  enTransaccion,
  num,
  paramIds,
  sql,
  subIds,
  type Ejecutor,
  type Parametro,
} from "@/lib/data/sql";
import { ESTADO_PROBLEMA_CIERRE, ESTADO_PROBLEMA_INICIAL } from "@/lib/ui/estado";
import { trabajosDelMotivo } from "@/lib/ui/motivos";
import type {
  CatalogoEstadoProblema,
  CatalogoInterno,
  CatalogoGestionProblema,
  CatalogoMotivo,
  CatalogoCargo,
  CatalogoPendiente,
  CatalogoProblema,
  CatalogoProblemaOpcion,
  CatalogoSeccion,
  CatalogoTrabajo,
  CatalogoTrabajoSubtrabajo,
  ChecklistPlantilla,
} from "@/lib/types";

// Las listas que el panel edita y el móvil consume:
// dmc.catalogo_motivo, dmc.catalogo_problema (+opciones),
// dmc.catalogo_trabajo (+subtrabajos y los motivos a los que pertenece) y
// dmc.catalogo_interno (el checklist del comentario interno).
//
// Dos reglas que valen para todo este archivo:
//
// 1. NADA SE BORRA. Quitar una entrada la deja con activo = 0. Las visitas y
//    las actas ya registradas apuntan a ella por código y tienen que seguir
//    mostrándose tal como se firmaron.
// 2. El panel no guarda letra por letra: arma un borrador completo y lo manda
//    de una sola vez con guardarChecklist(). Así el orden, los nombres, las
//    altas y las bajas quedan consistentes entre sí o no queda nada.

// ── Lectura ─────────────────────────────────────────────────────────────────

interface FilaMotivo {
  id: number;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

/** Las secciones activas de motivos o de trabajos, en su orden. */
export async function listarSecciones(tipo: "MOTIVO" | "TRABAJO"): Promise<CatalogoSeccion[]> {
  const filas = await consultaCon<{ id: number; nombre: string; orden: number }>(
    `SELECT id, nombre, orden FROM dmc.catalogo_seccion
      WHERE tipo = @tipo AND activo = 1 ORDER BY orden, id`,
    [["tipo", sql.VarChar(10), tipo]]
  );
  return filas.map((f) => ({ id: num(f.id), nombre: f.nombre, orden: f.orden }));
}

export async function listarMotivos(): Promise<CatalogoMotivo[]> {
  const filas = await consulta<FilaMotivo & { seccion: string | null; seccion_orden: number | null }>(
    `SELECT m.id, m.codigo, m.nombre, m.orden, m.activo, s.nombre AS seccion, s.orden AS seccion_orden
       FROM dmc.catalogo_motivo m
       LEFT JOIN dmc.catalogo_seccion s ON s.id = m.seccion_id AND s.activo = 1
      WHERE m.activo = 1 ORDER BY m.orden, m.id`
  );
  return filas.map((f) => ({
    id: num(f.id),
    codigo: f.codigo,
    nombre: f.nombre,
    orden: f.orden,
    activo: Boolean(f.activo),
    seccion: f.seccion,
    seccionOrden: f.seccion_orden ?? 0,
  }));
}

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
  permite_cantidad: boolean;
  activo: boolean;
}

export async function listarProblemas(): Promise<CatalogoProblema[]> {
  const [filas, opciones] = await Promise.all([
    consulta<FilaProblema>(
      `SELECT id, codigo, nombre, grupo_label, singular, ayuda, orden, activo
         FROM dmc.catalogo_problema WHERE activo = 1 ORDER BY orden, id`
    ),
    consulta<FilaOpcion>(
      `SELECT id, problema_id, etiqueta, orden, permite_cantidad, activo
         FROM dmc.catalogo_problema_opcion WHERE activo = 1 ORDER BY orden, id`
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
        permiteCantidad: Boolean(o.permite_cantidad),
        activo: Boolean(o.activo),
      })
    ),
  }));
}

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
  permite_cantidad: boolean;
  activo: boolean;
}

export async function listarTrabajos(): Promise<CatalogoTrabajo[]> {
  const [filas, subs, enlaces] = await Promise.all([
    consulta<FilaTrabajo & { seccion: string | null; seccion_orden: number | null }>(
      `SELECT t.id, t.codigo, t.nombre, t.grupo_label, t.singular, t.orden, t.activo,
              s.nombre AS seccion, s.orden AS seccion_orden
         FROM dmc.catalogo_trabajo t
         LEFT JOIN dmc.catalogo_seccion s ON s.id = t.seccion_id AND s.activo = 1
        WHERE t.activo = 1 ORDER BY t.orden, t.id`
    ),
    consulta<FilaSubtrabajo>(
      `SELECT id, trabajo_id, etiqueta, orden, permite_cantidad, activo
         FROM dmc.catalogo_trabajo_subtrabajo WHERE activo = 1 ORDER BY orden, id`
    ),
    // Solo los motivos activos: los enlaces de uno dado de baja no cuentan.
    consulta<{ trabajo_id: number; codigo: string; orden: number }>(
      `SELECT mt.trabajo_id, m.codigo, mt.orden
         FROM dmc.catalogo_motivo_trabajo mt
         JOIN dmc.catalogo_motivo m ON m.id = mt.motivo_id AND m.activo = 1
        ORDER BY m.orden, m.id`
    ),
  ]);

  const porTrabajo = agrupar(subs, (s) => num(s.trabajo_id));
  const motivosPorTrabajo = agrupar(enlaces, (e) => num(e.trabajo_id));
  return filas.map((f) => {
    const enlazados = motivosPorTrabajo.get(num(f.id)) ?? [];
    return {
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
          permiteCantidad: Boolean(s.permite_cantidad),
          activo: Boolean(s.activo),
        })
      ),
      motivosCodigos: enlazados.map((e) => e.codigo),
      ordenEnMotivo: Object.fromEntries(enlazados.map((e) => [e.codigo, e.orden])),
      seccion: f.seccion,
      seccionOrden: f.seccion_orden ?? 0,
    };
  });
}

export async function listarInternos(): Promise<CatalogoInterno[]> {
  const filas = await consulta<FilaMotivo>(
    `SELECT id, codigo, nombre, orden, activo
       FROM dmc.catalogo_interno WHERE activo = 1 ORDER BY orden, id`
  );
  return filas.map((f) => ({
    id: num(f.id),
    codigo: f.codigo,
    nombre: f.nombre,
    orden: f.orden,
    activo: Boolean(f.activo),
  }));
}

/** Los pasos del checklist de gestión de reagendas y pendientes. */
export async function listarPendientes(): Promise<CatalogoPendiente[]> {
  const filas = await consulta<FilaMotivo>(
    `SELECT id, codigo, nombre, orden, activo
       FROM dmc.catalogo_pendiente WHERE activo = 1 ORDER BY orden, id`
  );
  return filas.map((f) => ({
    id: num(f.id),
    codigo: f.codigo,
    nombre: f.nombre,
    orden: f.orden,
    activo: Boolean(f.activo),
  }));
}

/** Los cargos que se ofrecen para el responsable de tienda. */
export async function listarCargos(): Promise<CatalogoCargo[]> {
  const filas = await consulta<FilaMotivo>(
    `SELECT id, codigo, nombre, orden, activo
       FROM dmc.catalogo_cargo WHERE activo = 1 ORDER BY orden, id`
  );
  return filas.map((f) => ({
    id: num(f.id),
    codigo: f.codigo,
    nombre: f.nombre,
    orden: f.orden,
    activo: Boolean(f.activo),
  }));
}

/**
 * El cargo como está escrito en el checklist, o null si no es uno de la lista.
 * Es lo único que se guarda en una visita: así un texto
 * suelto no se cuela y la mayúscula siempre es la del checklist.
 */
export async function cargoDelChecklist(nombre: string | null | undefined): Promise<string | null> {
  const buscado = nombre?.trim();
  if (!buscado) return null;
  // nombre es nvarchar con intercalación sin mayúsculas: «jefe» encuentra «Jefe».
  const [fila] = await consultaCon<{ nombre: string }>(
    `SELECT TOP 1 nombre FROM dmc.catalogo_cargo
      WHERE activo = 1 AND LTRIM(RTRIM(nombre)) = @nombre COLLATE Latin1_General_CI_AS
      ORDER BY orden, id`,
    [["nombre", sql.NVarChar(80), buscado]]
  );
  return fila?.nombre ?? null;
}

/** Los pasos del checklist de gestión de problemas. */
export async function listarGestionProblemas(): Promise<CatalogoGestionProblema[]> {
  const filas = await consulta<FilaMotivo>(
    `SELECT id, codigo, nombre, orden, activo
       FROM dmc.catalogo_problema_gestion WHERE activo = 1 ORDER BY orden, id`
  );
  return filas.map((f) => ({
    id: num(f.id),
    codigo: f.codigo,
    nombre: f.nombre,
    orden: f.orden,
    activo: Boolean(f.activo),
  }));
}

/** ¿Ese código es un estado vigente de la Lista 7? */
export async function esEstadoProblemaVigente(codigo: string): Promise<boolean> {
  const [fila] = await consultaCon<{ n: number }>(
    `SELECT TOP 1 1 AS n FROM dmc.catalogo_problema_estado WHERE codigo = @codigo`,
    [["codigo", sql.VarChar(10), codigo]]
  );
  return Boolean(fila);
}

/**
 * Los estados de un problema, en su orden. Vienen también los inactivos: un
 * problema que quedó en un estado ya quitado tiene que seguir mostrando su
 * nombre. Quien ofrece estados para elegir filtra por `activo`.
 */
export async function listarEstadosProblema(): Promise<CatalogoEstadoProblema[]> {
  const filas = await consulta<FilaMotivo>(
    `SELECT id, codigo, nombre, orden, activo
       FROM dmc.catalogo_problema_estado ORDER BY activo DESC, orden, id`
  );
  return filas.map((f) => ({
    id: num(f.id),
    codigo: f.codigo,
    nombre: f.nombre,
    orden: f.orden,
    activo: Boolean(f.activo),
  }));
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

// ── Guardado en bloque ──────────────────────────────────────────────────────

/** Una entrada del borrador. `id` en null significa que es nueva. */
export interface ItemBorrador {
  id: number | null;
  etiqueta: string;
  permiteCantidad: boolean;
}

export interface MotivoBorrador {
  id: number | null;
  nombre: string;
}

export interface ProblemaBorrador {
  id: number | null;
  nombre: string;
  grupoLabel: string | null;
  opciones: ItemBorrador[];
}

/** Un motivo con los trabajos que se ofrecen bajo él. */
export interface MotivoConTrabajos extends MotivoBorrador {
  /**
   * Sus trabajos en orden, POR NOMBRE y no por id: un trabajo recién agregado
   * en el mismo borrador todavía no tiene id. Vacío = ninguno.
   */
  trabajos?: string[];
  /** Su sección, por nombre (debe estar en `seccionesMotivo`). Null o ausente = sin sección. */
  seccion?: string | null;
}

export interface TrabajoBorrador {
  id: number | null;
  nombre: string;
  grupoLabel: string | null;
  subtrabajos: ItemBorrador[];
  /** Su sección, por nombre (debe estar en `seccionesTrabajo`). Null o ausente = sin sección. */
  seccion?: string | null;
  /**
   * Solo plantillas guardadas antes de los trabajos por motivo: los motivos del
   * trabajo, por nombre, con vacío = todos. Ahora la relación viaja en
   * `motivos[].trabajos`.
   */
  motivos?: string[];
}

export interface BorradorChecklist {
  motivos: MotivoConTrabajos[];
  problemas: ProblemaBorrador[];
  trabajos: TrabajoBorrador[];
  /**
   * Las secciones de motivos y de trabajos, por nombre y en su orden. Sin la
   * lista (un panel viejo todavía abierto) no se tocan las secciones.
   */
  seccionesMotivo?: string[];
  seccionesTrabajo?: string[];
  /** Checklist del comentario interno. Misma forma que los motivos. */
  internos?: MotivoBorrador[];
  /** Checklist de gestión de reagendas y pendientes. Misma forma que los motivos. */
  pendientes?: MotivoBorrador[];
  /** Cargos del responsable de tienda. Misma forma que los motivos. */
  cargos?: MotivoBorrador[];
  /** Checklist de gestión de problemas. Misma forma que los motivos. */
  gestionProblemas?: MotivoBorrador[];
  /** Los estados de un problema. Misma forma que los motivos. */
  estadosProblema?: MotivoBorrador[];
}

export interface ResumenChecklist {
  motivos: number;
  problemas: number;
  trabajos: number;
  internos: number;
  pendientes: number;
  cargos: number;
  gestionProblemas: number;
  estadosProblema: number;
  desactivados: number;
}

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

// ── Plantilla propia ────────────────────────────────────────────────────────

/**
 * El checklist arranca vacío y se arma a mano. Cuando queda como se quiere, el
 * panel guarda esta foto; el botón Reiniciar vuelve exactamente a ella.
 *
 * Se guarda por nombre y no por id: el panel maneja una sola, "Mi plantilla".
 */
export const PLANTILLA_PROPIA = "Mi plantilla";

export async function guardarPlantilla(nombre: string, usuarioId: number | null): Promise<ChecklistPlantilla> {
  const [motivos, problemas, trabajos, internos, pendientes, cargos, gestionProblemas, seccionesMotivo, seccionesTrabajo] =
    await Promise.all([
      listarMotivos(),
      listarProblemas(),
      listarTrabajos(),
      listarInternos(),
      listarPendientes(),
      listarCargos(),
      listarGestionProblemas(),
      listarSecciones("MOTIVO"),
      listarSecciones("TRABAJO"),
    ]);
  const payload: BorradorChecklist = {
    seccionesMotivo: seccionesMotivo.map((s) => s.nombre),
    seccionesTrabajo: seccionesTrabajo.map((s) => s.nombre),
    motivos: motivos.map((m) => ({
      id: null,
      nombre: m.nombre,
      seccion: m.seccion ?? null,
      trabajos: trabajosDelMotivo(trabajos, m.codigo).map((t) => t.nombre),
    })),
    problemas: problemas.map((p) => ({
      id: null,
      nombre: p.nombre,
      grupoLabel: p.grupoLabel,
      opciones: p.opciones.map((o) => ({
        id: null,
        etiqueta: o.etiqueta,
        permiteCantidad: o.permiteCantidad,
      })),
    })),
    trabajos: trabajos.map((t) => ({
      id: null,
      nombre: t.nombre,
      grupoLabel: t.grupoLabel,
      seccion: t.seccion ?? null,
      subtrabajos: t.subtrabajos.map((s) => ({
        id: null,
        etiqueta: s.etiqueta,
        permiteCantidad: s.permiteCantidad,
      })),
    })),
    internos: internos.map((x) => ({ id: null, nombre: x.nombre })),
    pendientes: pendientes.map((x) => ({ id: null, nombre: x.nombre })),
    cargos: cargos.map((x) => ({ id: null, nombre: x.nombre })),
    gestionProblemas: gestionProblemas.map((x) => ({ id: null, nombre: x.nombre })),
  };

  await ejecutar(
    `MERGE dmc.checklist_plantilla AS destino
     USING (SELECT @nombre AS nombre) AS origen ON destino.nombre = origen.nombre
     WHEN MATCHED THEN UPDATE SET payload = @payload, creado_por = @usuario, actualizado_en = SYSDATETIME()
     WHEN NOT MATCHED THEN INSERT (nombre, payload, creado_por) VALUES (@nombre, @payload, @usuario);`,
    [
      ["nombre", sql.NVarChar(80), nombre],
      ["payload", sql.NVarChar(sql.MAX), JSON.stringify(payload)],
      ["usuario", sql.BigInt, usuarioId],
    ]
  );

  const guardada = await getPlantilla(nombre);
  if (!guardada) throw new Error("La plantilla no quedó guardada.");
  return guardada;
}

interface FilaPlantilla {
  id: number;
  nombre: string;
  payload: string;
  creado_en: string;
  actualizado_en: string;
}

async function leerPlantilla(nombre: string): Promise<{ fila: FilaPlantilla; datos: BorradorChecklist } | null> {
  const [fila] = await consultaCon<FilaPlantilla>(
    `SELECT id, nombre, payload,
            CONVERT(varchar(19), creado_en, 126)      AS creado_en,
            CONVERT(varchar(19), actualizado_en, 126) AS actualizado_en
       FROM dmc.checklist_plantilla WHERE nombre = @nombre`,
    [["nombre", sql.NVarChar(80), nombre]]
  );
  if (!fila) return null;

  try {
    const datos = JSON.parse(fila.payload) as BorradorChecklist;
    return {
      fila,
      datos: {
        motivos: datos.motivos ?? [],
        problemas: datos.problemas ?? [],
        trabajos: datos.trabajos ?? [],
        // Plantillas guardadas antes de que existieran las secciones: sin ellas.
        seccionesMotivo: datos.seccionesMotivo,
        seccionesTrabajo: datos.seccionesTrabajo,
        // Plantillas guardadas antes de que existieran: sin estas listas.
        internos: datos.internos,
        pendientes: datos.pendientes,
        cargos: datos.cargos,
        gestionProblemas: datos.gestionProblemas,
      },
    };
  } catch {
    log.error("plantilla del checklist con JSON ilegible", { nombre });
    return null;
  }
}

/** Metadatos de la plantilla, para mostrar qué tiene guardado sin aplicarla. */
export async function getPlantilla(nombre: string): Promise<ChecklistPlantilla | null> {
  const leida = await leerPlantilla(nombre);
  if (!leida) return null;
  return {
    id: num(leida.fila.id),
    nombre: leida.fila.nombre,
    creadoEn: leida.fila.creado_en,
    actualizadoEn: leida.fila.actualizado_en,
    motivos: leida.datos.motivos.length,
    problemas: leida.datos.problemas.length,
    trabajos: leida.datos.trabajos.length,
    internos: leida.datos.internos?.length ?? 0,
    pendientes: leida.datos.pendientes?.length ?? 0,
    cargos: leida.datos.cargos?.length ?? 0,
    gestionProblemas: leida.datos.gestionProblemas?.length ?? 0,
  };
}

/**
 * Deja las tres listas exactamente como quedaron en la plantilla. Todo lo que
 * no esté en ella se desactiva; lo que coincida por nombre se reutiliza para no
 * romper el código con el que ya se registraron visitas.
 */
export async function aplicarPlantilla(nombre: string): Promise<ResumenChecklist> {
  const leida = await leerPlantilla(nombre);
  if (!leida) throw new Error("Todavía no has guardado ninguna plantilla.");

  const [motivos, problemas, trabajos, internos, pendientes, cargos, gestionProblemas] = await Promise.all([
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
    listarInternos(),
    listarPendientes(),
    listarCargos(),
    listarGestionProblemas(),
  ]);

  const idPorNombre = <T extends { id: number; nombre: string }>(lista: T[], buscado: string) =>
    lista.find((x) => x.nombre.trim().toLowerCase() === buscado.trim().toLowerCase())?.id ?? null;

  // Una plantilla fijada antes de los trabajos por motivo trae la relación al revés:
  // cada trabajo con sus motivos, y sin motivos quería decir «en todos».
  const deTrabajos = !leida.datos.motivos.some((m) => m.trabajos);
  const trabajosDe = (motivo: string) =>
    leida.datos.trabajos
      .filter((t) => {
        const suyos = (t.motivos ?? []).map((n) => n.trim().toLowerCase());
        return !suyos.length || suyos.includes(motivo.trim().toLowerCase());
      })
      .map((t) => t.nombre);

  const borrador: BorradorChecklist = {
    // Una plantilla sin secciones (anterior a ellas) las deja como están.
    seccionesMotivo: leida.datos.seccionesMotivo,
    seccionesTrabajo: leida.datos.seccionesTrabajo,
    motivos: leida.datos.motivos.map((m) => ({
      id: idPorNombre(motivos, m.nombre),
      nombre: m.nombre,
      seccion: m.seccion ?? null,
      trabajos: deTrabajos ? trabajosDe(m.nombre) : (m.trabajos ?? []),
    })),
    problemas: leida.datos.problemas.map((p) => ({
      id: idPorNombre(problemas, p.nombre),
      nombre: p.nombre,
      grupoLabel: p.grupoLabel,
      // Los hijos van siempre con id null: guardarHijos reactiva por etiqueta.
      opciones: p.opciones.map((o) => ({ id: null, etiqueta: o.etiqueta, permiteCantidad: o.permiteCantidad })),
    })),
    trabajos: leida.datos.trabajos.map((t) => ({
      id: idPorNombre(trabajos, t.nombre),
      nombre: t.nombre,
      grupoLabel: t.grupoLabel,
      seccion: t.seccion ?? null,
      subtrabajos: t.subtrabajos.map((s) => ({ id: null, etiqueta: s.etiqueta, permiteCantidad: s.permiteCantidad })),
    })),
    internos: leida.datos.internos?.map((x) => ({ id: idPorNombre(internos, x.nombre), nombre: x.nombre })),
    pendientes: leida.datos.pendientes?.map((x) => ({ id: idPorNombre(pendientes, x.nombre), nombre: x.nombre })),
    cargos: leida.datos.cargos?.map((x) => ({ id: idPorNombre(cargos, x.nombre), nombre: x.nombre })),
    gestionProblemas: leida.datos.gestionProblemas?.map((x) => ({
      id: idPorNombre(gestionProblemas, x.nombre),
      nombre: x.nombre,
    })),
  };

  return guardarChecklist(borrador);
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
