import "server-only";
import {
  agrupar,
  consultaCon,
  num,
  numONull,
  paramIds,
  sql,
  subIds,
  F_FECHA,
  F_HORA,
  F_TS,
  type Parametro,
} from "@/lib/data/sql";
import { cancelarVisitasVencidas } from "@/lib/data/vencimiento";
import type { EquipoVisita } from "@/lib/validacion/reglas-acta";
import type {
  EstadoProblema,
  EstadoVisita,
  OrigenRegistro,
  Problema,
  ProblemaItem,
  Reagendamiento,
  Visita,
  VisitaEdicion,
  VisitaEjecucion,
  VisitaFirma,
  VisitaFoto,
  VisitaVideo,
  VisitaTrabajo,
  VisitaTrabajoSubtrabajo,
} from "@/lib/types";

// Visitas y todo lo que cuelga de ellas: la lectura.
//
// Las relaciones no se traen con un JOIN gigante que multiplique filas: la
// consulta principal trae las visitas con sus maestros, y cada tabla hija se
// consulta aparte filtrando por el mismo criterio. Después se agrupan en
// memoria. Son consultas fijas, no una por visita.

// ── Filtro compartido entre la visita y sus hijas ───────────────────────────

interface Filtro {
  where: string;
  params: Parametro[];
}

// Una visita eliminada (activo = 0) no es "otro estado": es como si no
// existiera para el panel, el celular y los gráficos. Por eso el filtro va
// acá, en cada filtro que comparten todas las lecturas, y no repetido en cada
// pantalla.

/** Las del técnico asignado y también en las que va de ayudante. */
function porTecnico(tecnicoId: number): Filtro {
  return {
    where: "(v.tecnico_id = @f_tecnico OR v.tecnico_ayudante_id = @f_tecnico) AND v.activo = 1",
    params: [["f_tecnico", sql.BigInt, tecnicoId]],
  };
}

function porFolio(folio: string): Filtro {
  return { where: "v.folio = @f_folio AND v.activo = 1", params: [["f_folio", sql.VarChar(16), folio]] };
}

// Las eliminadas: solo las lee el administrador, y siempre por puertas aparte
// para que ninguna otra lectura las traiga por descuido.
function eliminadaPorFolio(folio: string): Filtro {
  return { where: "v.folio = @f_folio AND v.activo = 0", params: [["f_folio", sql.VarChar(16), folio]] };
}

function porId(id: number): Filtro {
  return { where: "v.id = @f_id AND v.activo = 1", params: [["f_id", sql.BigInt, id]] };
}

/** Una página ya elegida por id (ver visitas-lista.ts). Vigentes o eliminadas, nunca mezcladas. */
function porIds(ids: number[], eliminadas: boolean): Filtro {
  return { where: `v.id IN ${subIds("f_ids")} AND v.activo = ${eliminadas ? 0 : 1}`, params: [paramIds("f_ids", ids)] };
}

/** Todas las de los locales que hoy tienen una visita reagendada o pendiente. */
const DE_LOCALES_CON_PENDIENTES: Filtro = {
  where: `v.activo = 1 AND v.sucursal_id IN
            (SELECT p.sucursal_id FROM dmc.visita p
              WHERE p.estado IN ('REAGENDADA', 'PENDIENTE') AND p.activo = 1)`,
  params: [],
};

/** `WHERE <hija>.visita_id IN (…)` con el mismo criterio que la consulta madre. */
function subconsultaIds(filtro: Filtro): string {
  return `SELECT v.id FROM dmc.visita v WHERE ${filtro.where}`;
}

// ── Filas crudas ────────────────────────────────────────────────────────────

interface FilaVisita {
  id: number;
  folio: string;
  cliente_id: number;
  sucursal_id: number;
  tecnico_id: number;
  tecnico_ayudante_id: number | null;
  motivo_codigo: string;
  estado: EstadoVisita;
  fecha_programada: string;
  fecha_hasta: string | null;
  hora_programada: string | null;
  trabajo_solicitado: string;
  indicaciones_acceso: string | null;
  responsable_nombre: string | null;
  responsable_rut: string | null;
  responsable_telefono: string | null;
  responsable_cargo: string | null;
  motivo_pendiente: string | null;
  tomada_por: number | null;
  problema_origen_id: number | null;
  creada_en_terreno: boolean;
  creado_en: string;

  c_rut: string;
  c_razon_social: string;
  c_nombre_fantasia: string;
  c_activo: boolean;

  s_nombre: string;
  s_codigo: string | null;
  s_direccion: string;
  s_comuna: string;
  s_region: string;
  s_telefono: string | null;
  s_activo: boolean;
  s_cliente_id: number;

  t_rut: string;
  t_nombres: string;
  t_apellido_paterno: string;
  t_apellido_materno: string | null;
  t_nombre_completo: string;
  t_email: string;
  t_telefono: string | null;
  t_activo: boolean;

  ta_nombre_completo: string | null;
  ta_telefono: string | null;

  m_id: number | null;
  m_nombre: string | null;
  m_orden: number | null;
  m_activo: boolean | null;
}

// El motivo de una visita PENDIENTE o CANCELADA no vive en dmc.visita: lo deja
// el técnico en dmc.visita_estado_historial al cambiarle el estado. Se recupera
// el último registro que coincide con el estado actual.
export const MOTIVO_PENDIENTE = `
  (SELECT TOP 1 h.motivo
     FROM dmc.visita_estado_historial h
    WHERE h.visita_id = v.id AND h.estado = v.estado AND h.motivo IS NOT NULL
    ORDER BY h.ocurrido_en DESC, h.id DESC)`;

/**
 * Quién tiene tomada una visita EN_CURSO: el asignado o el ayudante.
 *
 * No tiene columna propia: es el técnico de la última fila EN_CURSO de la
 * bitácora, que `iniciarVisita` deja escrita. Si esa fila no es del ayudante
 * actual (visitas iniciadas antes de este cambio, o un ayudante que
 * coordinación cambió después), la tiene el asignado. Fuera de EN_CURSO, null.
 */
export const TOMADA_POR = `
  CASE WHEN v.estado = 'EN_CURSO' THEN
    CASE WHEN v.tecnico_ayudante_id IS NOT NULL AND v.tecnico_ayudante_id =
              (SELECT TOP 1 h.tecnico_id
                 FROM dmc.visita_estado_historial h
                WHERE h.visita_id = v.id AND h.estado = 'EN_CURSO'
                ORDER BY h.id DESC)
         THEN v.tecnico_ayudante_id
         ELSE v.tecnico_id END
  END`;

const SELECT_VISITA = `
  SELECT v.id, v.folio, v.cliente_id, v.sucursal_id, v.tecnico_id, v.tecnico_ayudante_id,
         v.motivo_codigo, v.estado,
         ${F_FECHA("v.fecha_programada")} AS fecha_programada,
         ${F_FECHA("v.fecha_hasta")}      AS fecha_hasta,
         ${F_HORA("v.hora_programada")}   AS hora_programada,
         v.trabajo_solicitado, v.indicaciones_acceso, v.responsable_nombre,
         v.responsable_rut, v.responsable_telefono, v.responsable_cargo,
         ${MOTIVO_PENDIENTE} AS motivo_pendiente,
         ${TOMADA_POR} AS tomada_por,
         v.problema_origen_id, v.creada_en_terreno,
         ${F_TS("v.creado_en")} AS creado_en,

         c.rut AS c_rut, c.razon_social AS c_razon_social,
         c.nombre_fantasia AS c_nombre_fantasia, c.activo AS c_activo,

         s.nombre AS s_nombre, s.codigo AS s_codigo, s.direccion AS s_direccion,
         s.comuna AS s_comuna, s.region AS s_region, s.telefono AS s_telefono,
         s.activo AS s_activo, s.cliente_id AS s_cliente_id,

         t.rut AS t_rut, t.nombres AS t_nombres, t.apellido_paterno AS t_apellido_paterno,
         t.apellido_materno AS t_apellido_materno, t.nombre_completo AS t_nombre_completo,
         t.email AS t_email, t.telefono AS t_telefono, t.activo AS t_activo,

         ta.nombre_completo AS ta_nombre_completo, ta.telefono AS ta_telefono,

         cm.id AS m_id, cm.nombre AS m_nombre, cm.orden AS m_orden, cm.activo AS m_activo
    FROM dmc.visita   v
    JOIN dmc.cliente  c ON c.id = v.cliente_id
    JOIN dmc.sucursal s ON s.id = v.sucursal_id
    JOIN dmc.tecnico  t ON t.id = v.tecnico_id
    LEFT JOIN dmc.tecnico ta ON ta.id = v.tecnico_ayudante_id
    LEFT JOIN dmc.catalogo_motivo cm ON cm.codigo = v.motivo_codigo`;

interface FilaEjecucion {
  visita_id: number;
  hora_inicio: string;
  hora_termino: string | null;
  responsable_nombre: string;
  responsable_rut: string | null;
  responsable_telefono: string | null;
  responsable_cargo: string | null;
  motivo_real_codigo: string | null;
  observaciones: string | null;
  comentario_interno: string | null;
  dispositivo: string | null;
  app_version: string | null;
  registrado_offline: boolean;
  sincronizado_en: string | null;
  editable_hasta: string | null;
  editable_tecnico: boolean;
}

/**
 * Cuántos días tiene el técnico para corregir su acta después de cerrarla. El
 * plazo corre desde la hora de cierre y lo mide la base con su propio reloj:
 * así no depende del huso del servidor de la app ni del celular.
 */
export const DIAS_PARA_EDITAR = 1;
const EDITABLE_HASTA = `DATEADD(day, ${DIAS_PARA_EDITAR}, hora_termino)`;

interface FilaEdicion {
  id: number;
  visita_id: number;
  origen: OrigenRegistro;
  por: string | null;
  motivo: string;
  secciones: string;
  detalle: string;
  editado_en: string;
}

interface FilaTrabajo {
  id: number;
  visita_id: number;
  trabajo_codigo: string;
  motivo_codigo: string | null;
  detalle: string | null;
  orden: number;
}

interface FilaSubtrabajo {
  id: number;
  visita_trabajo_id: number;
  etiqueta: string;
  cantidad: number;
  orden: number;
}

interface FilaProblema {
  id: number;
  visita_id: number;
  tipo_codigo: string;
  estado: EstadoProblema;
  descripcion: string | null;
  solucion: string | null;
  orden: number;
  resuelto_en: string | null;
  creado_en: string;
}

interface FilaItem {
  id: number;
  problema_id: number;
  etiqueta: string;
  cantidad: number;
}

interface FilaFoto {
  id: number;
  visita_id: number;
  problema_id: number | null;
  etiqueta: string | null;
  archivo_url: string;
  interno: boolean;
  orden: number;
  tomada_en: string | null;
}

interface FilaVideo {
  id: number;
  visita_id: number;
  problema_id: number | null;
  etiqueta: string | null;
  archivo_url: string;
  interno: boolean;
  mime: string;
  bytes: number | null;
  duracion_seg: number | null;
  ancho: number | null;
  alto: number | null;
  orden: number;
  grabado_en: string | null;
}

interface FilaFirma {
  id: number;
  visita_id: number;
  rol: "TIENDA" | "TECNICO";
  nombre: string;
  rut: string | null;
  imagen_url: string;
  firmado_en: string;
}

interface FilaInterno {
  visita_id: number;
  interno_codigo: string;
  nombre: string | null;
}

interface FilaMotivoVisita {
  visita_id: number;
  motivo_codigo: string;
  nombre: string | null;
  ambito: "PLAN" | "REAL";
}

interface FilaReagendamiento {
  id: number;
  visita_id: number;
  fecha_anterior: string;
  hora_anterior: string | null;
  fecha_nueva: string | null;
  hora_nueva: string | null;
  motivo: string;
  origen: OrigenRegistro;
}

// ── Carga ───────────────────────────────────────────────────────────────────

async function cargar(filtro: Filtro): Promise<Visita[]> {
  // Antes de leer, lo vencido pasa a CANCELADA: así ni el panel ni el celular
  // muestran abierta una visita que ya salió del plazo.
  await cancelarVisitasVencidas();
  const ids = subconsultaIds(filtro);
  const p = () => filtro.params.map((x) => [...x] as Parametro);

  const [
    visitas,
    motivosVisita,
    ejecuciones,
    trabajos,
    subtrabajos,
    problemas,
    items,
    fotos,
    videos,
    firmas,
    reagendas,
    internos,
    ediciones,
  ] = await Promise.all([
      consultaCon<FilaVisita>(
        `${SELECT_VISITA} WHERE ${filtro.where} ORDER BY v.fecha_programada DESC, v.hora_programada, v.id DESC`,
        p()
      ),
      consultaCon<FilaMotivoVisita>(
        `SELECT vm.visita_id, vm.motivo_codigo, cm.nombre, vm.ambito
           FROM dmc.visita_motivo vm
           LEFT JOIN dmc.catalogo_motivo cm ON cm.codigo = vm.motivo_codigo
          WHERE vm.visita_id IN (${ids}) ORDER BY vm.ambito, vm.orden, vm.id`,
        p()
      ),
      consultaCon<FilaEjecucion>(
        `SELECT visita_id, ${F_TS("hora_inicio")} AS hora_inicio, ${F_TS("hora_termino")} AS hora_termino,
                responsable_nombre, responsable_rut, responsable_telefono, responsable_cargo,
                motivo_real_codigo, observaciones, comentario_interno, dispositivo, app_version, registrado_offline,
                ${F_TS("sincronizado_en")} AS sincronizado_en,
                ${F_TS(EDITABLE_HASTA)} AS editable_hasta,
                CAST(CASE WHEN hora_termino IS NOT NULL AND ${EDITABLE_HASTA} >= SYSDATETIME()
                          THEN 1 ELSE 0 END AS bit) AS editable_tecnico
           FROM dmc.visita_ejecucion WHERE visita_id IN (${ids})`,
        p()
      ),
      consultaCon<FilaTrabajo>(
        `SELECT id, visita_id, trabajo_codigo, motivo_codigo, detalle, orden
           FROM dmc.visita_trabajo
          WHERE visita_id IN (${ids}) AND activo = 1 ORDER BY orden, id`,
        p()
      ),
      consultaCon<FilaSubtrabajo>(
        `SELECT s.id, s.visita_trabajo_id, s.etiqueta, s.cantidad, s.orden
           FROM dmc.visita_trabajo_subtrabajo s
           JOIN dmc.visita_trabajo w ON w.id = s.visita_trabajo_id
          WHERE w.visita_id IN (${ids}) AND w.activo = 1 ORDER BY s.orden, s.id`,
        p()
      ),
      consultaCon<FilaProblema>(
        `SELECT id, visita_id, tipo_codigo, estado, descripcion, solucion, orden,
                ${F_TS("resuelto_en")} AS resuelto_en, ${F_TS("creado_en")} AS creado_en
           FROM dmc.problema WHERE visita_id IN (${ids}) ORDER BY orden, id`,
        p()
      ),
      consultaCon<FilaItem>(
        `SELECT i.id, i.problema_id, i.etiqueta, i.cantidad
           FROM dmc.problema_item i
           JOIN dmc.problema p ON p.id = i.problema_id
          WHERE p.visita_id IN (${ids}) ORDER BY i.id`,
        p()
      ),
      consultaCon<FilaFoto>(
        `SELECT id, visita_id, problema_id, etiqueta, archivo_url, interno, orden,
                ${F_TS("tomada_en")} AS tomada_en
           FROM dmc.visita_foto
          WHERE visita_id IN (${ids}) AND activo = 1 ORDER BY orden, id`,
        p()
      ),
      // Solo los clips que terminaron de subir: los que se cortaron a mitad de
      // la señal existen en la tabla, pero no son reproducibles.
      consultaCon<FilaVideo>(
        `SELECT id, visita_id, problema_id, etiqueta, archivo_url, interno, mime, bytes,
                duracion_seg, ancho, alto, orden, ${F_TS("grabado_en")} AS grabado_en
           FROM dmc.visita_video
          WHERE visita_id IN (${ids}) AND activo = 1 AND subida_completa = 1
          ORDER BY orden, id`,
        p()
      ),
      consultaCon<FilaFirma>(
        `SELECT id, visita_id, rol, nombre, rut, imagen_url, ${F_TS("firmado_en")} AS firmado_en
           FROM dmc.visita_firma WHERE visita_id IN (${ids}) ORDER BY id`,
        p()
      ),
      consultaCon<FilaReagendamiento>(
        `SELECT id, visita_id, ${F_FECHA("fecha_anterior")} AS fecha_anterior,
                ${F_HORA("hora_anterior")} AS hora_anterior, ${F_FECHA("fecha_nueva")} AS fecha_nueva,
                ${F_HORA("hora_nueva")} AS hora_nueva, motivo, origen
           FROM dmc.reagendamiento WHERE visita_id IN (${ids}) ORDER BY creado_en DESC, id DESC`,
        p()
      ),
      consultaCon<FilaInterno>(
        `SELECT vi.visita_id, vi.interno_codigo, ci.nombre
           FROM dmc.visita_interno vi
           LEFT JOIN dmc.catalogo_interno ci ON ci.codigo = vi.interno_codigo
          WHERE vi.visita_id IN (${ids}) ORDER BY vi.orden, vi.id`,
        p()
      ),
      // Las correcciones al acta ya cerrada. Quién: el técnico si la hizo desde
      // el celular; si no, el correo de la cuenta del panel.
      consultaCon<FilaEdicion>(
        `SELECT e.id, e.visita_id, e.origen, COALESCE(t.nombre_completo, u.email) AS por,
                e.motivo, e.secciones, e.detalle, ${F_TS("e.editado_en")} AS editado_en
           FROM dmc.visita_edicion e
           LEFT JOIN dmc.usuario u ON u.id = e.usuario_id
           LEFT JOIN dmc.tecnico t ON t.id = e.tecnico_id
          WHERE e.visita_id IN (${ids}) ORDER BY e.editado_en DESC, e.id DESC`,
        p()
      ),
    ]);

  const subPorTrabajo = agrupar(subtrabajos, (s) => num(s.visita_trabajo_id));
  const itemsPorProblema = agrupar(items, (i) => num(i.problema_id));
  const trabajosPorVisita = agrupar(trabajos, (t) => num(t.visita_id));
  const problemasPorVisita = agrupar(problemas, (x) => num(x.visita_id));
  const fotosPorVisita = agrupar(fotos, (f) => num(f.visita_id));
  const videosPorVisita = agrupar(videos, (v) => num(v.visita_id));
  const firmasPorVisita = agrupar(firmas, (f) => num(f.visita_id));
  const reagendasPorVisita = agrupar(reagendas, (r) => num(r.visita_id));
  const ejecucionPorVisita = new Map(ejecuciones.map((e) => [num(e.visita_id), e]));
  const motivosPorVisita = agrupar(motivosVisita, (m) => num(m.visita_id));
  const internosPorVisita = agrupar(internos, (x) => num(x.visita_id));
  const edicionesPorVisita = agrupar(ediciones, (x) => num(x.visita_id));

  return visitas.map((v) => {
    const id = num(v.id);
    const ejec = ejecucionPorVisita.get(id);
    const susMotivos = motivosPorVisita.get(id) ?? [];

    // El motivo principal encabeza siempre la lista, aunque dmc.visita_motivo
    // todavia no tenga fila (visita anterior a dmc.visita_motivo).
    const codigosDe = (ambito: "PLAN" | "REAL", principal: string | null) => {
      const codigos = susMotivos.filter((m) => m.ambito === ambito).map((m) => m.motivo_codigo);
      if (principal && !codigos.includes(principal)) codigos.unshift(principal);
      return codigos;
    };

    return {
      id,
      folio: v.folio,
      clienteId: num(v.cliente_id),
      sucursalId: num(v.sucursal_id),
      tecnicoId: num(v.tecnico_id),
      tecnicoAyudanteId: numONull(v.tecnico_ayudante_id),
      tomadaPorTecnicoId: numONull(v.tomada_por),
      motivoCodigo: v.motivo_codigo,
      estado: v.estado,
      fechaProgramada: v.fecha_programada,
      fechaHasta: v.fecha_hasta,
      horaProgramada: v.hora_programada,
      trabajoSolicitado: v.trabajo_solicitado,
      indicacionesAcceso: v.indicaciones_acceso,
      responsableNombre: v.responsable_nombre,
      responsableRut: v.responsable_rut,
      responsableTelefono: v.responsable_telefono,
      responsableCargo: v.responsable_cargo,
      motivoPendiente: v.motivo_pendiente,
      problemaOrigenId: numONull(v.problema_origen_id),
      creadaEnTerreno: Boolean(v.creada_en_terreno),
      creadoEn: v.creado_en,

      cliente: {
        id: num(v.cliente_id),
        rut: v.c_rut,
        razonSocial: v.c_razon_social,
        nombreFantasia: v.c_nombre_fantasia,
        activo: Boolean(v.c_activo),
      },
      sucursal: {
        id: num(v.sucursal_id),
        clienteId: num(v.s_cliente_id),
        nombre: v.s_nombre,
        codigo: v.s_codigo,
        direccion: v.s_direccion,
        comuna: v.s_comuna,
        region: v.s_region,
        telefono: v.s_telefono,
        activo: Boolean(v.s_activo),
      },
      tecnico: {
        id: num(v.tecnico_id),
        rut: v.t_rut,
        nombres: v.t_nombres,
        apellidoPaterno: v.t_apellido_paterno,
        apellidoMaterno: v.t_apellido_materno,
        nombreCompleto: v.t_nombre_completo,
        email: v.t_email,
        telefono: v.t_telefono,
        activo: Boolean(v.t_activo),
      },
      tecnicoAyudante:
        v.tecnico_ayudante_id != null
          ? {
              id: num(v.tecnico_ayudante_id),
              nombreCompleto: v.ta_nombre_completo ?? "",
              telefono: v.ta_telefono,
            }
          : undefined,
      motivosCodigos: codigosDe("PLAN", v.motivo_codigo),
      motivosNombres: codigosDe("PLAN", v.motivo_codigo).map(
        (c) =>
          susMotivos.find((m) => m.ambito === "PLAN" && m.motivo_codigo === c)?.nombre ??
          (c === v.motivo_codigo ? v.m_nombre ?? c : c)
      ),

      motivo:
        v.m_id === null
          ? undefined
          : {
              id: num(v.m_id),
              codigo: v.motivo_codigo,
              nombre: v.m_nombre ?? v.motivo_codigo,
              orden: v.m_orden ?? 0,
              activo: Boolean(v.m_activo),
            },

      ejecucion: ejec
        ? ({
            visitaId: id,
            horaInicio: ejec.hora_inicio,
            horaTermino: ejec.hora_termino,
            responsableNombre: ejec.responsable_nombre,
            responsableRut: ejec.responsable_rut,
            responsableTelefono: ejec.responsable_telefono,
            responsableCargo: ejec.responsable_cargo,
            motivoRealCodigo: ejec.motivo_real_codigo,
            motivosRealesCodigos: codigosDe("REAL", ejec.motivo_real_codigo),
            observaciones: ejec.observaciones,
            comentarioInterno: ejec.comentario_interno,
            dispositivo: ejec.dispositivo,
            appVersion: ejec.app_version,
            registradoOffline: Boolean(ejec.registrado_offline),
            sincronizadoEn: ejec.sincronizado_en,
            editableHasta: ejec.editable_hasta,
            editablePorTecnico: Boolean(ejec.editable_tecnico),
          } satisfies VisitaEjecucion)
        : undefined,

      trabajos: (trabajosPorVisita.get(id) ?? []).map(
        (t): VisitaTrabajo => ({
          id: num(t.id),
          visitaId: id,
          trabajoCodigo: t.trabajo_codigo,
          motivoCodigo: t.motivo_codigo,
          detalle: t.detalle,
          orden: t.orden,
          subtrabajos: (subPorTrabajo.get(num(t.id)) ?? []).map(
            (s): VisitaTrabajoSubtrabajo => ({
              id: num(s.id),
              visitaTrabajoId: num(s.visita_trabajo_id),
              etiqueta: s.etiqueta,
              cantidad: s.cantidad,
              orden: s.orden,
            })
          ),
        })
      ),

      problemas: (problemasPorVisita.get(id) ?? []).map((x) => mapearProblema(x, itemsPorProblema)),

      fotos: (fotosPorVisita.get(id) ?? []).map(
        (f): VisitaFoto => ({
          id: num(f.id),
          visitaId: id,
          problemaId: numONull(f.problema_id),
          etiqueta: f.etiqueta,
          archivoUrl: f.archivo_url,
          interno: Boolean(f.interno),
          orden: f.orden,
          tomadaEn: f.tomada_en,
        })
      ),

      videos: (videosPorVisita.get(id) ?? []).map(
        (v): VisitaVideo => ({
          id: num(v.id),
          visitaId: id,
          problemaId: numONull(v.problema_id),
          etiqueta: v.etiqueta,
          archivoUrl: v.archivo_url,
          interno: Boolean(v.interno),
          mime: v.mime,
          bytes: numONull(v.bytes),
          duracionSeg: numONull(v.duracion_seg),
          ancho: numONull(v.ancho),
          alto: numONull(v.alto),
          orden: v.orden,
          grabadoEn: v.grabado_en,
        })
      ),

      firmas: (firmasPorVisita.get(id) ?? []).map(
        (f): VisitaFirma => ({
          id: num(f.id),
          visitaId: id,
          rol: f.rol,
          nombre: f.nombre,
          rut: f.rut,
          imagenUrl: f.imagen_url,
          firmadoEn: f.firmado_en,
        })
      ),

      reagendamientos: (reagendasPorVisita.get(id) ?? []).map(
        (r): Reagendamiento => ({
          id: num(r.id),
          visitaId: id,
          fechaAnterior: r.fecha_anterior,
          horaAnterior: r.hora_anterior,
          fechaNueva: r.fecha_nueva,
          horaNueva: r.hora_nueva,
          motivo: r.motivo,
          origen: r.origen,
        })
      ),

      internos: (internosPorVisita.get(id) ?? []).map((x) => ({
        codigo: x.interno_codigo,
        nombre: x.nombre ?? x.interno_codigo,
      })),

      ediciones: (edicionesPorVisita.get(id) ?? []).map(
        (e): VisitaEdicion => ({
          id: num(e.id),
          visitaId: id,
          origen: e.origen,
          por: e.por ?? "—",
          motivo: e.motivo,
          secciones: e.secciones.split(" · ").filter(Boolean),
          detalle: e.detalle.split("\n").filter(Boolean),
          editadoEn: e.editado_en,
        })
      ),
    } satisfies Visita;
  });
}

function mapearProblema(x: FilaProblema, itemsPorProblema: Map<number, FilaItem[]>): Problema {
  const pid = num(x.id);
  return {
    id: pid,
    visitaId: num(x.visita_id),
    tipoCodigo: x.tipo_codigo,
    estado: x.estado,
    descripcion: x.descripcion,
    solucion: x.solucion,
    orden: x.orden,
    resueltoEn: x.resuelto_en,
    creadoEn: x.creado_en,
    items: (itemsPorProblema.get(pid) ?? []).map(
      (i): ProblemaItem => ({
        id: num(i.id),
        problemaId: pid,
        etiqueta: i.etiqueta,
        cantidad: i.cantidad,
      })
    ),
  };
}

// ── Lectura ─────────────────────────────────────────────────────────────────

/**
 * Las visitas de esos ids, completas y en el orden de la lista. Las eliminadas
 * solo con `eliminadas`, que pide el administrador (quien llama comprueba el
 * rol), y vienen con quién las eliminó.
 */
export async function getVisitasPorIds(ids: number[], opciones: { eliminadas?: boolean } = {}): Promise<Visita[]> {
  if (ids.length === 0) return [];
  const visitas = await cargar(porIds(ids, Boolean(opciones.eliminadas)));
  return opciones.eliminadas ? conEliminacion(visitas) : visitas;
}

/** Las visitas de los locales con algo reagendado o pendiente: lo que necesita esa vista. */
export function getVisitasDeLocalesConPendientes(): Promise<Visita[]> {
  return cargar(DE_LOCALES_CON_PENDIENTES);
}

export function getVisitasPorTecnico(tecnicoId: number): Promise<Visita[]> {
  return cargar(porTecnico(tecnicoId));
}

export async function getVisitaCompletaPorFolio(folio: string): Promise<Visita | undefined> {
  const [visita] = await cargar(porFolio(folio));
  return visita;
}

export async function getVisitaCompleta(id: number): Promise<Visita | undefined> {
  const [visita] = await cargar(porId(id));
  return visita;
}

/** Estado y equipo de una visita: lo que la acción mira para autorizar. */
export async function getEquipoDeVisita(folio: string): Promise<EquipoVisita | undefined> {
  const [v] = await consultaCon<{
    estado: EstadoVisita;
    tecnico_id: number;
    tecnico_ayudante_id: number | null;
    tomada_por: number | null;
  }>(
    `SELECT v.estado, v.tecnico_id, v.tecnico_ayudante_id, ${TOMADA_POR} AS tomada_por
       FROM dmc.visita v WHERE v.folio = @folio AND v.activo = 1`,
    [["folio", sql.VarChar(16), folio]]
  );
  if (!v) return undefined;
  return {
    estado: v.estado,
    tecnicoId: num(v.tecnico_id),
    tecnicoAyudanteId: numONull(v.tecnico_ayudante_id),
    tomadaPorTecnicoId: numONull(v.tomada_por),
  };
}

/** Una visita eliminada, para que el administrador la abra. Mismo cuidado con el rol. */
export async function getVisitaEliminadaPorFolio(folio: string): Promise<Visita | undefined> {
  const [visita] = await conEliminacion(await cargar(eliminadaPorFolio(folio)));
  return visita;
}

async function conEliminacion(visitas: Visita[]): Promise<Visita[]> {
  if (visitas.length === 0) return visitas;
  const filas = await consultaCon<{ visita_id: number; por: string | null; en: string }>(
    `SELECT e.visita_id, u.email AS por, ${F_TS("e.eliminado_en")} AS en
       FROM dmc.visita_eliminacion e
       LEFT JOIN dmc.usuario u ON u.id = e.usuario_id
      WHERE e.visita_id IN ${subIds("ids")}
      ORDER BY e.id`,
    [paramIds("ids", visitas.map((v) => v.id))]
  );
  // Ordenadas por id: si una visita tiene más de un registro, queda el último.
  const porVisita = new Map(filas.map((f) => [num(f.visita_id), { por: f.por ?? "—", en: f.en }]));
  return visitas.map((v) => ({ ...v, eliminacion: porVisita.get(v.id) ?? { por: "—", en: "" } }));
}

/** Todos los problemas levantados, con su visita resuelta. Para el panel. */
export async function getTodosLosProblemas(): Promise<Problema[]> {
  const [problemas, items] = await Promise.all([
    consultaCon<FilaProblema>(
      `SELECT p.id, p.visita_id, p.tipo_codigo, p.estado, p.descripcion, p.solucion, p.orden,
              ${F_TS("p.resuelto_en")} AS resuelto_en, ${F_TS("p.creado_en")} AS creado_en
         FROM dmc.problema p
         JOIN dmc.visita v ON v.id = p.visita_id
        WHERE v.activo = 1
        ORDER BY p.creado_en DESC, p.id DESC`,
      []
    ),
    consultaCon<FilaItem>(`SELECT id, problema_id, etiqueta, cantidad FROM dmc.problema_item ORDER BY id`, []),
  ]);
  const itemsPorProblema = agrupar(items, (i) => num(i.problema_id));
  return problemas.map((p) => mapearProblema(p, itemsPorProblema));
}
