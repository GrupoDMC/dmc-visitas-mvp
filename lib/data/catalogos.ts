import "server-only";
import { agrupar, consulta, consultaCon, ejecutar, num, sql } from "@/lib/data/sql";
import { ESTADO_PROBLEMA_CIERRE, ESTADO_PROBLEMA_INICIAL, ESTADOS_PROBLEMA_BASE } from "@/lib/ui/estado";
import { trabajosDelMotivo } from "@/lib/ui/motivos";
import type {
  CatalogoEstadoProblema,
  CatalogoInterno,
  CatalogoGestionProblema,
  CatalogoMotivo,
  CatalogoPendiente,
  CatalogoProblema,
  CatalogoProblemaOpcion,
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

export async function listarMotivos(): Promise<CatalogoMotivo[]> {
  const filas = await consulta<FilaMotivo>(
    `SELECT id, codigo, nombre, orden, activo
       FROM dmc.catalogo_motivo WHERE activo = 1 ORDER BY orden, id`
  );
  return filas.map((f) => ({
    id: num(f.id),
    codigo: f.codigo,
    nombre: f.nombre,
    orden: f.orden,
    activo: Boolean(f.activo),
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

let conOrdenPorMotivo = false;

/**
 * ¿Está la migración 019 (dmc.catalogo_motivo_trabajo.orden)? Con ella cada
 * motivo ordena sus trabajos y un trabajo sin motivos no se ofrece en ninguno.
 * Sin ella sigue la regla de antes: sin motivos = en todos.
 */
export async function hayTrabajosPorMotivo(): Promise<boolean> {
  if (conOrdenPorMotivo) return true;
  const [fila] = await consulta<{ largo: number | null }>(
    `SELECT COL_LENGTH('dmc.catalogo_motivo_trabajo', 'orden') AS largo`
  );
  conOrdenPorMotivo = fila?.largo != null;
  return conOrdenPorMotivo;
}

export async function listarTrabajos(): Promise<CatalogoTrabajo[]> {
  const conOrden = await hayTrabajosPorMotivo();
  const [filas, subs, enlaces, motivos] = await Promise.all([
    consulta<FilaTrabajo>(
      `SELECT id, codigo, nombre, grupo_label, singular, orden, activo
         FROM dmc.catalogo_trabajo WHERE activo = 1 ORDER BY orden, id`
    ),
    consulta<FilaSubtrabajo>(
      `SELECT id, trabajo_id, etiqueta, orden, permite_cantidad, activo
         FROM dmc.catalogo_trabajo_subtrabajo WHERE activo = 1 ORDER BY orden, id`
    ),
    // Solo los motivos activos: los enlaces de uno dado de baja no cuentan.
    consulta<{ trabajo_id: number; codigo: string; orden: number }>(
      `SELECT mt.trabajo_id, m.codigo, ${conOrden ? "mt.orden" : "CAST(0 AS smallint)"} AS orden
         FROM dmc.catalogo_motivo_trabajo mt
         JOIN dmc.catalogo_motivo m ON m.id = mt.motivo_id AND m.activo = 1
        ORDER BY m.orden, m.id`
    ),
    conOrden ? Promise.resolve([]) : listarMotivos(),
  ]);

  const porTrabajo = agrupar(subs, (s) => num(s.trabajo_id));
  const motivosPorTrabajo = agrupar(enlaces, (e) => num(e.trabajo_id));
  return filas.map((f) => {
    // Sin la migración 019, un trabajo sin motivos se sigue ofreciendo en
    // todos: se resuelve acá para que el resto de la app use una sola regla.
    const suyos = motivosPorTrabajo.get(num(f.id)) ?? [];
    const enlazados = suyos.length || conOrden ? suyos : motivos.map((m) => ({ codigo: m.codigo, orden: f.orden }));
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
      // Sin la migración 019 la columna no existe y manda el orden global.
      ordenEnMotivo: Object.fromEntries(enlazados.map((e) => [e.codigo, conOrden ? e.orden : f.orden])),
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

/** La Lista 5 necesita la migración 014. Sin ella el resto del checklist sigue andando. */
export class FaltaMigracionPendientes extends Error {
  constructor() {
    super("Falta la migración 014: dmc.catalogo_pendiente");
    this.name = "FaltaMigracionPendientes";
  }
}

let conGestion = false;

/** ¿Está la migración 014? Una vez que aparece no se vuelve a preguntar. */
export async function hayGestionPendientes(): Promise<boolean> {
  if (conGestion) return true;
  const [fila] = await consulta<{ id: number | null }>(
    `SELECT OBJECT_ID('dmc.visita_pendiente_gestion', 'U') AS id`
  );
  conGestion = fila?.id != null;
  return conGestion;
}

/** Los pasos del checklist de gestión de reagendas y pendientes. */
export async function listarPendientes(): Promise<CatalogoPendiente[]> {
  if (!(await hayGestionPendientes())) return [];
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

/** La Lista 6 necesita la migración 015. Sin ella el resto del checklist sigue andando. */
export class FaltaMigracionGestionProblemas extends Error {
  constructor() {
    super("Falta la migración 015: dmc.catalogo_problema_gestion");
    this.name = "FaltaMigracionGestionProblemas";
  }
}

let conGestionProblemas = false;

/** ¿Está la migración 015? Una vez que aparece no se vuelve a preguntar. */
export async function hayGestionProblemas(): Promise<boolean> {
  if (conGestionProblemas) return true;
  const [fila] = await consulta<{ id: number | null }>(`SELECT OBJECT_ID('dmc.problema_gestion', 'U') AS id`);
  conGestionProblemas = fila?.id != null;
  return conGestionProblemas;
}

/** Los pasos del checklist de gestión de problemas. */
export async function listarGestionProblemas(): Promise<CatalogoGestionProblema[]> {
  if (!(await hayGestionProblemas())) return [];
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

/** La Lista 7 necesita la migración 016. Sin ella siguen los tres estados de siempre. */
export class FaltaMigracionEstadosProblema extends Error {
  constructor() {
    super("Falta la migración 016: dmc.catalogo_problema_estado");
    this.name = "FaltaMigracionEstadosProblema";
  }
}

let conEstadosProblema = false;

/** ¿Está la migración 016? Una vez que aparece no se vuelve a preguntar. */
export async function hayEstadosProblema(): Promise<boolean> {
  if (conEstadosProblema) return true;
  const [fila] = await consulta<{ id: number | null }>(
    `SELECT OBJECT_ID('dmc.catalogo_problema_estado', 'U') AS id`
  );
  conEstadosProblema = fila?.id != null;
  return conEstadosProblema;
}

/**
 * Los estados de un problema, en su orden. Vienen también los inactivos: un
 * problema que quedó en un estado ya quitado tiene que seguir mostrando su
 * nombre. Quien ofrece estados para elegir filtra por `activo`.
 */
export async function listarEstadosProblema(): Promise<CatalogoEstadoProblema[]> {
  if (!(await hayEstadosProblema())) return ESTADOS_PROBLEMA_BASE;
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
async function guardarEstadosProblema(items: MotivoBorrador[]): Promise<{ vivos: number; desactivados: number }> {
  const filas = await consulta<{ id: number; codigo: string; nombre: string }>(
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
      await ejecutar(
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
    const [fila] = await consultaCon<{ id: number }>(
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

  const lista = vivos.length ? vivos.join(",") : "0";
  const desactivados = await ejecutar(
    `UPDATE dmc.catalogo_problema_estado SET activo = 0
      WHERE activo = 1 AND id NOT IN (${lista})
        AND codigo NOT IN ('${ESTADO_PROBLEMA_INICIAL}', '${ESTADO_PROBLEMA_CIERRE}')`
  );
  const [cuenta] = await consulta<{ n: number }>(
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
}

export interface TrabajoBorrador {
  id: number | null;
  nombre: string;
  grupoLabel: string | null;
  subtrabajos: ItemBorrador[];
  /**
   * Solo plantillas guardadas antes de la migración 019: los motivos del
   * trabajo, por nombre, con vacío = todos. Ahora la relación viaja en
   * `motivos[].trabajos`.
   */
  motivos?: string[];
}

export interface BorradorChecklist {
  motivos: MotivoConTrabajos[];
  problemas: ProblemaBorrador[];
  trabajos: TrabajoBorrador[];
  /** Checklist del comentario interno. Misma forma que los motivos. */
  internos?: MotivoBorrador[];
  /** Checklist de gestión de reagendas y pendientes. Misma forma que los motivos. */
  pendientes?: MotivoBorrador[];
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
  let desactivados = 0;

  // ── Motivos ──
  const motivos = await guardarListaSimple("dmc.catalogo_motivo", borrador.motivos, "MOTIVO");
  const vivosMotivo = motivos.vivos;
  desactivados += motivos.desactivados;

  // ── Tipos de problema ──
  const padresProblema = await padresExistentes("dmc.catalogo_problema");
  const vivosProblema: number[] = [];
  for (const [i, p] of borrador.problemas.entries()) {
    const nombre = p.nombre.trim();
    if (!nombre) continue;
    const resuelto = resolverPadre(padresProblema, p.id, nombre, "TIPO");
    let id = resuelto.id;
    if (resuelto.esNuevo) {
      const [fila] = await consultaCon<{ id: number }>(
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
      await ejecutar(
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
      "dmc.catalogo_problema_opcion",
      "problema_id",
      id,
      p.opciones
    );
  }
  desactivados += await desactivarSobrantes("dmc.catalogo_problema", vivosProblema);

  // ── Trabajos realizados ──
  const padresTrabajo = await padresExistentes("dmc.catalogo_trabajo");
  const vivosTrabajo: number[] = [];
  const trabajoPorNombre = new Map<string, number>();
  for (const [i, t] of borrador.trabajos.entries()) {
    const nombre = t.nombre.trim();
    if (!nombre) continue;
    const resuelto = resolverPadre(padresTrabajo, t.id, nombre, "TRABAJO");
    let id = resuelto.id;
    if (resuelto.esNuevo) {
      const [fila] = await consultaCon<{ id: number }>(
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
      await ejecutar(
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
      "dmc.catalogo_trabajo_subtrabajo",
      "trabajo_id",
      id,
      t.subtrabajos
    );
  }
  desactivados += await desactivarSobrantes("dmc.catalogo_trabajo", vivosTrabajo);

  // ── Qué trabajos van en cada motivo ──
  await guardarTrabajosPorMotivo(borrador.motivos, motivos.idPorNombre, trabajoPorNombre);

  // ── Checklist del comentario interno ──
  // Sin la lista en el borrador (un panel viejo todavía abierto) no se toca:
  // si no, guardar los motivos vaciaría el checklist interno.
  let vivosInterno: number;
  if (borrador.internos) {
    const internos = await guardarListaSimple("dmc.catalogo_interno", borrador.internos, "INTERNO");
    vivosInterno = internos.vivos.length;
    desactivados += internos.desactivados;
  } else {
    vivosInterno = (await listarInternos()).length;
  }

  // ── Checklist de gestión de pendientes ──
  // Igual que el interno: sin la lista en el borrador no se toca. Y sin la
  // migración 014 solo se reclama si de verdad hay algo que guardar en ella.
  let vivosPendiente = 0;
  if (await hayGestionPendientes()) {
    if (borrador.pendientes) {
      const pendientes = await guardarListaSimple("dmc.catalogo_pendiente", borrador.pendientes, "PENDIENTE");
      vivosPendiente = pendientes.vivos.length;
      desactivados += pendientes.desactivados;
    } else {
      vivosPendiente = (await listarPendientes()).length;
    }
  } else if (borrador.pendientes?.some((x) => x.nombre.trim())) {
    throw new FaltaMigracionPendientes();
  }

  // ── Checklist de gestión de problemas ── (misma regla, con la migración 015)
  let vivosGestionProblema = 0;
  if (await hayGestionProblemas()) {
    if (borrador.gestionProblemas) {
      const gestion = await guardarListaSimple("dmc.catalogo_problema_gestion", borrador.gestionProblemas, "GESTION");
      vivosGestionProblema = gestion.vivos.length;
      desactivados += gestion.desactivados;
    } else {
      vivosGestionProblema = (await listarGestionProblemas()).length;
    }
  } else if (borrador.gestionProblemas?.some((x) => x.nombre.trim())) {
    throw new FaltaMigracionGestionProblemas();
  }

  // ── Estados del problema ── (migración 016)
  // Sin la migración solo se reclama si la lista dejó de ser la de siempre.
  let vivosEstado = ESTADOS_PROBLEMA_BASE.length;
  if (await hayEstadosProblema()) {
    if (borrador.estadosProblema) {
      const estados = await guardarEstadosProblema(borrador.estadosProblema);
      vivosEstado = estados.vivos;
      desactivados += estados.desactivados;
    } else {
      vivosEstado = (await listarEstadosProblema()).filter((e) => e.activo).length;
    }
  } else if (borrador.estadosProblema) {
    const nombres = borrador.estadosProblema.map((e) => e.nombre.trim()).filter(Boolean);
    const deSiempre = ESTADOS_PROBLEMA_BASE.map((e) => e.nombre);
    if (nombres.length !== deSiempre.length || nombres.some((n, i) => n !== deSiempre[i])) {
      throw new FaltaMigracionEstadosProblema();
    }
  }

  return {
    motivos: vivosMotivo.length,
    problemas: vivosProblema.length,
    trabajos: vivosTrabajo.length,
    internos: vivosInterno,
    pendientes: vivosPendiente,
    gestionProblemas: vivosGestionProblema,
    estadosProblema: vivosEstado,
    desactivados,
  };
}

/**
 * Reescribe los enlaces motivo → trabajo de cada motivo del borrador, con la
 * posición de cada trabajo dentro del motivo como orden. Los motivos que se
 * desactivaron conservan sus enlaces: si vuelven, vuelven con sus trabajos.
 *
 * Va en dos sentencias y no en una por enlace: con 20 motivos de 5 trabajos
 * serían 100 idas y vueltas al servidor. Los ids se interpolan, así que se
 * filtran a enteros de verdad.
 */
async function guardarTrabajosPorMotivo(
  motivos: MotivoConTrabajos[],
  motivoPorNombre: Map<string, number>,
  trabajoPorNombre: Map<string, number>
): Promise<void> {
  const entero = (n: number | undefined): n is number => n !== undefined && Number.isSafeInteger(n) && n > 0;
  const tocados: number[] = [];
  const filas: string[] = [];
  for (const m of motivos) {
    const motivoId = motivoPorNombre.get(m.nombre.trim().toLowerCase());
    if (!entero(motivoId)) continue;
    tocados.push(motivoId);
    const vistos = new Set<number>();
    for (const nombre of m.trabajos ?? []) {
      const trabajoId = trabajoPorNombre.get(nombre.trim().toLowerCase());
      if (!entero(trabajoId) || vistos.has(trabajoId)) continue;
      vistos.add(trabajoId);
      filas.push(`(${motivoId}, ${trabajoId}, ${vistos.size})`);
    }
  }
  if (!tocados.length) return;

  const conOrden = await hayTrabajosPorMotivo();
  const valores = conOrden ? filas : filas.map((f) => f.replace(/, \d+\)$/, ")"));
  // Un INSERT … VALUES admite hasta 1000 filas.
  const inserts: string[] = [];
  for (let i = 0; i < valores.length; i += 900) {
    inserts.push(
      `INSERT INTO dmc.catalogo_motivo_trabajo (motivo_id, trabajo_id${conOrden ? ", orden" : ""})
       VALUES ${valores.slice(i, i + 900).join(",")};`
    );
  }
  await ejecutar(
    `SET XACT_ABORT ON;
     BEGIN TRANSACTION;
     DELETE FROM dmc.catalogo_motivo_trabajo WHERE motivo_id IN (${tocados.join(",")});
     ${inserts.join("\n")}
     COMMIT TRANSACTION;`
  );
}

/**
 * Motivos, checklist interno y las dos listas de gestión: todas son una
 * lista plana de (codigo, nombre, orden, activo), así que se guardan igual.
 */
async function guardarListaSimple(
  tabla:
    | "dmc.catalogo_motivo"
    | "dmc.catalogo_interno"
    | "dmc.catalogo_pendiente"
    | "dmc.catalogo_problema_gestion",
  items: MotivoBorrador[],
  respaldo: string
): Promise<{ vivos: number[]; idPorNombre: Map<string, number>; desactivados: number }> {
  const padres = await padresExistentes(tabla);
  const vivos: number[] = [];
  const idPorNombre = new Map<string, number>();
  for (const [i, m] of items.entries()) {
    const nombre = m.nombre.trim();
    if (!nombre) continue;
    const resuelto = resolverPadre(padres, m.id, nombre, respaldo);
    let id = resuelto.id;
    if (resuelto.esNuevo) {
      const [fila] = await consultaCon<{ id: number }>(
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
      await ejecutar(`UPDATE ${tabla} SET nombre = @nombre, orden = @orden, activo = 1 WHERE id = @id`, [
        ["nombre", sql.NVarChar(80), nombre],
        ["orden", sql.SmallInt, i + 1],
        ["id", sql.BigInt, id],
      ]);
    }
    vivos.push(id);
    idPorNombre.set(nombre.toLowerCase(), id);
  }
  const desactivados = await desactivarSobrantes(tabla, vivos);
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
  tabla: string,
  columnaPadre: string,
  padreId: number,
  items: ItemBorrador[]
): Promise<number> {
  // Los ids que de verdad cuelgan de este padre. Uno que no esté acá se trata
  // como alta: no se escribe sobre la fila de otro trabajo por un id inventado.
  const existentes = await consultaCon<{ id: number }>(`SELECT id FROM ${tabla} WHERE ${columnaPadre} = @padre`, [
    ["padre", sql.BigInt, padreId],
  ]);
  const idsHijos = new Set(existentes.map((f) => num(f.id)));
  const vivos: number[] = [];
  for (const [i, item] of items.entries()) {
    const etiqueta = item.etiqueta.trim();
    if (!etiqueta) continue;

    if (item.id !== null && idsHijos.has(item.id)) {
      await ejecutar(
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

    const [fila] = await consultaCon<{ id: number }>(
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

  return desactivarSobrantes(tabla, vivos, `${columnaPadre} = ${padreId}`);
}

/**
 * Apaga lo que quedó fuera del borrador. Devuelve cuántas filas cambiaron.
 *
 * La lista de ids se interpola, así que se filtra a enteros de verdad: un valor
 * raro colado desde el navegador no puede terminar dentro de la sentencia.
 */
async function desactivarSobrantes(tabla: string, vivos: number[], extra = "1 = 1"): Promise<number> {
  const enteros = vivos.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);
  const lista = enteros.length ? enteros.join(",") : "0";
  return ejecutar(`UPDATE ${tabla} SET activo = 0 WHERE ${extra} AND activo = 1 AND id NOT IN (${lista})`);
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
  const [motivos, problemas, trabajos, internos, pendientes, gestionProblemas] = await Promise.all([
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
    listarInternos(),
    listarPendientes(),
    listarGestionProblemas(),
  ]);
  const payload: BorradorChecklist = {
    motivos: motivos.map((m) => ({
      id: null,
      nombre: m.nombre,
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
      subtrabajos: t.subtrabajos.map((s) => ({
        id: null,
        etiqueta: s.etiqueta,
        permiteCantidad: s.permiteCantidad,
      })),
    })),
    internos: internos.map((x) => ({ id: null, nombre: x.nombre })),
    pendientes: pendientes.map((x) => ({ id: null, nombre: x.nombre })),
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
        // Plantillas guardadas antes de que existieran: sin estas listas.
        internos: datos.internos,
        pendientes: datos.pendientes,
        gestionProblemas: datos.gestionProblemas,
      },
    };
  } catch {
    console.error("[dmc] la plantilla del checklist tiene un JSON ilegible:", nombre);
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

  const [motivos, problemas, trabajos, internos, pendientes, gestionProblemas] = await Promise.all([
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
    listarInternos(),
    listarPendientes(),
    listarGestionProblemas(),
  ]);

  const idPorNombre = <T extends { id: number; nombre: string }>(lista: T[], buscado: string) =>
    lista.find((x) => x.nombre.trim().toLowerCase() === buscado.trim().toLowerCase())?.id ?? null;

  // Una plantilla fijada antes de la migración 019 trae la relación al revés:
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
    motivos: leida.datos.motivos.map((m) => ({
      id: idPorNombre(motivos, m.nombre),
      nombre: m.nombre,
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
      subtrabajos: t.subtrabajos.map((s) => ({ id: null, etiqueta: s.etiqueta, permiteCantidad: s.permiteCantidad })),
    })),
    internos: leida.datos.internos?.map((x) => ({ id: idPorNombre(internos, x.nombre), nombre: x.nombre })),
    pendientes: leida.datos.pendientes?.map((x) => ({ id: idPorNombre(pendientes, x.nombre), nombre: x.nombre })),
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

async function padresExistentes(tabla: string): Promise<PadresExistentes> {
  const filas = await consulta<{ id: number; codigo: string; nombre: string }>(
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
