import "server-only";
import { agrupar, consulta, consultaCon, num, sql } from "@/lib/data/sql";
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
} from "@/lib/types";

// Las listas del checklist que el panel edita y el móvil consume: la lectura.
// dmc.catalogo_motivo, dmc.catalogo_problema (+opciones), dmc.catalogo_trabajo
// (+subtrabajos y los motivos a los que pertenece), dmc.catalogo_interno y las
// listas de gestión, cargos, estados y secciones.

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
