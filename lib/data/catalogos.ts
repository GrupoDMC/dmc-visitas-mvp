import "server-only";
import { agrupar, consulta, consultaCon, ejecutar, num, sql } from "@/lib/data/sql";
import type {
  CatalogoMotivo,
  CatalogoProblema,
  CatalogoProblemaOpcion,
  CatalogoTrabajo,
  CatalogoTrabajoSubtrabajo,
  ChecklistPlantilla,
} from "@/lib/types";

// Las tres listas que el panel edita y el móvil consume:
// dmc.catalogo_motivo, dmc.catalogo_problema (+opciones) y
// dmc.catalogo_trabajo (+subtrabajos).
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

export async function listarTrabajos(): Promise<CatalogoTrabajo[]> {
  const [filas, subs] = await Promise.all([
    consulta<FilaTrabajo>(
      `SELECT id, codigo, nombre, grupo_label, singular, orden, activo
         FROM dmc.catalogo_trabajo WHERE activo = 1 ORDER BY orden, id`
    ),
    consulta<FilaSubtrabajo>(
      `SELECT id, trabajo_id, etiqueta, orden, permite_cantidad, activo
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
        permiteCantidad: Boolean(s.permite_cantidad),
        activo: Boolean(s.activo),
      })
    ),
  }));
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

export interface TrabajoBorrador {
  id: number | null;
  nombre: string;
  grupoLabel: string | null;
  subtrabajos: ItemBorrador[];
}

export interface BorradorChecklist {
  motivos: MotivoBorrador[];
  problemas: ProblemaBorrador[];
  trabajos: TrabajoBorrador[];
}

export interface ResumenChecklist {
  motivos: number;
  problemas: number;
  trabajos: number;
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
  const padresMotivo = await padresExistentes("dmc.catalogo_motivo");
  const vivosMotivo: number[] = [];
  for (const [i, m] of borrador.motivos.entries()) {
    const nombre = m.nombre.trim();
    if (!nombre) continue;
    const resuelto = resolverPadre(padresMotivo, m.id, nombre, "MOTIVO");
    if (resuelto.esNuevo) {
      const [fila] = await consultaCon<{ id: number }>(
        `INSERT INTO dmc.catalogo_motivo (codigo, nombre, orden, activo)
         OUTPUT INSERTED.id AS id VALUES (@codigo, @nombre, @orden, 1)`,
        [
          ["codigo", sql.VarChar(40), resuelto.codigo],
          ["nombre", sql.NVarChar(80), nombre],
          ["orden", sql.SmallInt, i + 1],
        ]
      );
      vivosMotivo.push(num(fila.id));
    } else {
      await ejecutar(
        `UPDATE dmc.catalogo_motivo SET nombre = @nombre, orden = @orden, activo = 1 WHERE id = @id`,
        [
          ["nombre", sql.NVarChar(80), nombre],
          ["orden", sql.SmallInt, i + 1],
          ["id", sql.BigInt, resuelto.id],
        ]
      );
      vivosMotivo.push(resuelto.id);
    }
  }
  desactivados += await desactivarSobrantes("dmc.catalogo_motivo", vivosMotivo);

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
    desactivados += await guardarHijos(
      "dmc.catalogo_trabajo_subtrabajo",
      "trabajo_id",
      id,
      t.subtrabajos
    );
  }
  desactivados += await desactivarSobrantes("dmc.catalogo_trabajo", vivosTrabajo);

  return {
    motivos: vivosMotivo.length,
    problemas: vivosProblema.length,
    trabajos: vivosTrabajo.length,
    desactivados,
  };
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
  const [motivos, problemas, trabajos] = await Promise.all([
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
  ]);

  const payload: BorradorChecklist = {
    motivos: motivos.map((m) => ({ id: null, nombre: m.nombre })),
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

  const [motivos, problemas, trabajos] = await Promise.all([
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
  ]);

  const idPorNombre = <T extends { id: number; nombre: string }>(lista: T[], buscado: string) =>
    lista.find((x) => x.nombre.trim().toLowerCase() === buscado.trim().toLowerCase())?.id ?? null;

  const borrador: BorradorChecklist = {
    motivos: leida.datos.motivos.map((m) => ({ id: idPorNombre(motivos, m.nombre), nombre: m.nombre })),
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
