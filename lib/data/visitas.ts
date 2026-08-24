import "server-only";
import { agrupar, consultaCon, ejecutar, num, numONull, sql, F_FECHA, F_HORA, F_TS, type Parametro } from "@/lib/data/sql";
import type {
  EstadoProblema,
  EstadoVisita,
  OrigenRegistro,
  Problema,
  ProblemaItem,
  Reagendamiento,
  Visita,
  VisitaEjecucion,
  VisitaFirma,
  VisitaFoto,
  VisitaTrabajo,
  VisitaTrabajoSubtrabajo,
} from "@/lib/types";

// Visitas y todo lo que cuelga de ellas. Reemplaza a lib/mock/visitas.
//
// Las relaciones no se traen con un JOIN gigante que multiplique filas: la
// consulta principal trae las visitas con sus maestros, y cada tabla hija se
// consulta aparte filtrando por el mismo criterio. Después se agrupan en
// memoria. Son 8 consultas fijas, no una por visita.

// ── Filtro compartido entre la visita y sus hijas ───────────────────────────

interface Filtro {
  where: string;
  params: Parametro[];
}

const TODAS: Filtro = { where: "1 = 1", params: [] };

function porTecnico(tecnicoId: number): Filtro {
  return { where: "v.tecnico_id = @f_tecnico", params: [["f_tecnico", sql.BigInt, tecnicoId]] };
}

function porFolio(folio: string): Filtro {
  return { where: "v.folio = @f_folio", params: [["f_folio", sql.VarChar(16), folio]] };
}

function porId(id: number): Filtro {
  return { where: "v.id = @f_id", params: [["f_id", sql.BigInt, id]] };
}

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
  motivo_codigo: string;
  estado: EstadoVisita;
  fecha_programada: string;
  hora_programada: string | null;
  trabajo_solicitado: string;
  indicaciones_acceso: string | null;
  responsable_nombre: string | null;
  responsable_telefono: string | null;
  motivo_pendiente: string | null;
  problema_origen_id: number | null;
  creada_en_terreno: boolean;
  creado_en: string;

  c_rut: string;
  c_razon_social: string;
  c_nombre_fantasia: string;
  c_activo: boolean;

  s_nombre: string;
  s_codigo: string;
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

  m_id: number | null;
  m_nombre: string | null;
  m_orden: number | null;
  m_activo: boolean | null;
}

// El motivo de una visita PENDIENTE o CANCELADA no vive en dmc.visita: lo deja
// el técnico en dmc.visita_estado_historial al cambiarle el estado. Se recupera
// el último registro que coincide con el estado actual.
const MOTIVO_PENDIENTE = `
  (SELECT TOP 1 h.motivo
     FROM dmc.visita_estado_historial h
    WHERE h.visita_id = v.id AND h.estado = v.estado AND h.motivo IS NOT NULL
    ORDER BY h.ocurrido_en DESC, h.id DESC)`;

const SELECT_VISITA = `
  SELECT v.id, v.folio, v.cliente_id, v.sucursal_id, v.tecnico_id, v.motivo_codigo, v.estado,
         ${F_FECHA("v.fecha_programada")} AS fecha_programada,
         ${F_HORA("v.hora_programada")}   AS hora_programada,
         v.trabajo_solicitado, v.indicaciones_acceso, v.responsable_nombre, v.responsable_telefono,
         ${MOTIVO_PENDIENTE} AS motivo_pendiente,
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

         cm.id AS m_id, cm.nombre AS m_nombre, cm.orden AS m_orden, cm.activo AS m_activo
    FROM dmc.visita   v
    JOIN dmc.cliente  c ON c.id = v.cliente_id
    JOIN dmc.sucursal s ON s.id = v.sucursal_id
    JOIN dmc.tecnico  t ON t.id = v.tecnico_id
    LEFT JOIN dmc.catalogo_motivo cm ON cm.codigo = v.motivo_codigo`;

interface FilaEjecucion {
  visita_id: number;
  hora_inicio: string;
  hora_termino: string | null;
  responsable_nombre: string;
  responsable_rut: string | null;
  responsable_telefono: string | null;
  motivo_real_codigo: string | null;
  observaciones: string | null;
  comentario_interno: string | null;
  dispositivo: string | null;
  app_version: string | null;
  registrado_offline: boolean;
  sincronizado_en: string | null;
}

interface FilaTrabajo {
  id: number;
  visita_id: number;
  trabajo_codigo: string;
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
  orden: number;
  tomada_en: string | null;
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
  const ids = subconsultaIds(filtro);
  const p = () => filtro.params.map((x) => [...x] as Parametro);

  const [visitas, ejecuciones, trabajos, subtrabajos, problemas, items, fotos, firmas, reagendas] =
    await Promise.all([
      consultaCon<FilaVisita>(
        `${SELECT_VISITA} WHERE ${filtro.where} ORDER BY v.fecha_programada DESC, v.hora_programada, v.id DESC`,
        p()
      ),
      consultaCon<FilaEjecucion>(
        `SELECT visita_id, ${F_TS("hora_inicio")} AS hora_inicio, ${F_TS("hora_termino")} AS hora_termino,
                responsable_nombre, responsable_rut, responsable_telefono, motivo_real_codigo,
                observaciones, comentario_interno, dispositivo, app_version, registrado_offline,
                ${F_TS("sincronizado_en")} AS sincronizado_en
           FROM dmc.visita_ejecucion WHERE visita_id IN (${ids})`,
        p()
      ),
      consultaCon<FilaTrabajo>(
        `SELECT id, visita_id, trabajo_codigo, detalle, orden
           FROM dmc.visita_trabajo WHERE visita_id IN (${ids}) ORDER BY orden, id`,
        p()
      ),
      consultaCon<FilaSubtrabajo>(
        `SELECT s.id, s.visita_trabajo_id, s.etiqueta, s.cantidad, s.orden
           FROM dmc.visita_trabajo_subtrabajo s
           JOIN dmc.visita_trabajo w ON w.id = s.visita_trabajo_id
          WHERE w.visita_id IN (${ids}) ORDER BY s.orden, s.id`,
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
        `SELECT id, visita_id, problema_id, etiqueta, archivo_url, orden, ${F_TS("tomada_en")} AS tomada_en
           FROM dmc.visita_foto WHERE visita_id IN (${ids}) ORDER BY orden, id`,
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
    ]);

  const subPorTrabajo = agrupar(subtrabajos, (s) => num(s.visita_trabajo_id));
  const itemsPorProblema = agrupar(items, (i) => num(i.problema_id));
  const trabajosPorVisita = agrupar(trabajos, (t) => num(t.visita_id));
  const problemasPorVisita = agrupar(problemas, (x) => num(x.visita_id));
  const fotosPorVisita = agrupar(fotos, (f) => num(f.visita_id));
  const firmasPorVisita = agrupar(firmas, (f) => num(f.visita_id));
  const reagendasPorVisita = agrupar(reagendas, (r) => num(r.visita_id));
  const ejecucionPorVisita = new Map(ejecuciones.map((e) => [num(e.visita_id), e]));

  return visitas.map((v) => {
    const id = num(v.id);
    const ejec = ejecucionPorVisita.get(id);

    return {
      id,
      folio: v.folio,
      clienteId: num(v.cliente_id),
      sucursalId: num(v.sucursal_id),
      tecnicoId: num(v.tecnico_id),
      motivoCodigo: v.motivo_codigo,
      estado: v.estado,
      fechaProgramada: v.fecha_programada,
      horaProgramada: v.hora_programada,
      trabajoSolicitado: v.trabajo_solicitado,
      indicacionesAcceso: v.indicaciones_acceso,
      responsableNombre: v.responsable_nombre,
      responsableTelefono: v.responsable_telefono,
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
            motivoRealCodigo: ejec.motivo_real_codigo,
            observaciones: ejec.observaciones,
            comentarioInterno: ejec.comentario_interno,
            dispositivo: ejec.dispositivo,
            appVersion: ejec.app_version,
            registradoOffline: Boolean(ejec.registrado_offline),
            sincronizadoEn: ejec.sincronizado_en,
          } satisfies VisitaEjecucion)
        : undefined,

      trabajos: (trabajosPorVisita.get(id) ?? []).map(
        (t): VisitaTrabajo => ({
          id: num(t.id),
          visitaId: id,
          trabajoCodigo: t.trabajo_codigo,
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
          orden: f.orden,
          tomadaEn: f.tomada_en,
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

export function getVisitasCompletas(): Promise<Visita[]> {
  return cargar(TODAS);
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

/** Todos los problemas levantados, con su visita resuelta. Para el panel. */
export async function getTodosLosProblemas(): Promise<Problema[]> {
  const [problemas, items] = await Promise.all([
    consultaCon<FilaProblema>(
      `SELECT id, visita_id, tipo_codigo, estado, descripcion, solucion, orden,
              ${F_TS("resuelto_en")} AS resuelto_en, ${F_TS("creado_en")} AS creado_en
         FROM dmc.problema ORDER BY creado_en DESC, id DESC`,
      []
    ),
    consultaCon<FilaItem>(`SELECT id, problema_id, etiqueta, cantidad FROM dmc.problema_item ORDER BY id`, []),
  ]);
  const itemsPorProblema = agrupar(items, (i) => num(i.problema_id));
  return problemas.map((p) => mapearProblema(p, itemsPorProblema));
}

// ── Escritura ───────────────────────────────────────────────────────────────

/** "Iniciar visita": deja la visita EN_CURSO y abre su ejecución. */
export async function iniciarVisita(folio: string, responsable: string | null): Promise<boolean> {
  const filas = await consultaCon<{ id: number; estado: EstadoVisita }>(
    `SELECT id, estado FROM dmc.visita WHERE folio = @folio`,
    [["folio", sql.VarChar(16), folio]]
  );
  const visita = filas[0];
  if (!visita) return false;
  if (visita.estado !== "PROGRAMADA" && visita.estado !== "EN_CURSO") return false;

  const id = num(visita.id);
  if (visita.estado === "PROGRAMADA") {
    await ejecutar(`UPDATE dmc.visita SET estado = 'EN_CURSO' WHERE id = @id`, [["id", sql.BigInt, id]]);
  }

  // La ejecución guarda la hora real de llegada. Se crea una sola vez: si el
  // técnico vuelve a entrar, no se pisa la hora con la que ya había registrado.
  await ejecutar(
    `IF NOT EXISTS (SELECT 1 FROM dmc.visita_ejecucion WHERE visita_id = @id)
       INSERT INTO dmc.visita_ejecucion (visita_id, hora_inicio, responsable_nombre)
       VALUES (@id, SYSDATETIME(), @responsable)`,
    [
      ["id", sql.BigInt, id],
      ["responsable", sql.NVarChar(120), responsable || "Por registrar"],
    ]
  );
  return true;
}

/**
 * Reagendar, dejar pendiente o cancelar. El motivo queda en la bitácora
 * dmc.visita_estado_historial, que es donde el esquema lo guarda: dmc.visita no
 * tiene columna para él.
 */
export async function cambiarEstadoVisita(input: {
  folio: string;
  estado: EstadoVisita;
  motivo: string;
  fechaNueva?: string | null;
  horaNueva?: string | null;
  origen: OrigenRegistro;
  usuarioId?: number | null;
  tecnicoId?: number | null;
}): Promise<boolean> {
  const [visita] = await consultaCon<{ id: number; fecha: string; hora: string | null }>(
    `SELECT id, ${F_FECHA("fecha_programada")} AS fecha, ${F_HORA("hora_programada")} AS hora
       FROM dmc.visita WHERE folio = @folio`,
    [["folio", sql.VarChar(16), input.folio]]
  );
  if (!visita) return false;
  const id = num(visita.id);

  if (input.estado === "REAGENDADA") {
    await ejecutar(
      `INSERT INTO dmc.reagendamiento
         (visita_id, fecha_anterior, hora_anterior, fecha_nueva, hora_nueva, motivo, origen, tecnico_id, usuario_id)
       VALUES (@id, @fechaAnt, @horaAnt, @fechaNue, @horaNue, @motivo, @origen, @tecnico, @usuario)`,
      [
        ["id", sql.BigInt, id],
        ["fechaAnt", sql.Date, visita.fecha],
        ["horaAnt", sql.VarChar(8), visita.hora],
        ["fechaNue", sql.Date, input.fechaNueva || null],
        ["horaNue", sql.VarChar(8), input.horaNueva || null],
        ["motivo", sql.NVarChar(sql.MAX), input.motivo],
        ["origen", sql.VarChar(6), input.origen],
        ["tecnico", sql.BigInt, input.tecnicoId ?? null],
        ["usuario", sql.BigInt, input.usuarioId ?? null],
      ]
    );
    if (input.fechaNueva) {
      await ejecutar(`UPDATE dmc.visita SET fecha_programada = @fecha, hora_programada = @hora WHERE id = @id`, [
        ["fecha", sql.Date, input.fechaNueva],
        ["hora", sql.VarChar(8), input.horaNueva || null],
        ["id", sql.BigInt, id],
      ]);
    }
  }

  await marcarEstado(id, input.estado, input.motivo, input.origen, input.usuarioId ?? null);
  return true;
}

/**
 * Cambia el estado y deja el motivo en la bitácora. El trigger tg_visita_cambio
 * ya inserta la fila del historial cuando el estado cambia de verdad: se le
 * completa el motivo. Si el estado no cambió, el trigger no insertó nada y la
 * fila se agrega acá para no perder la explicación.
 */
async function marcarEstado(
  id: number,
  estado: EstadoVisita,
  motivo: string | null,
  origen: OrigenRegistro,
  usuarioId: number | null
): Promise<void> {
  await ejecutar(
    `DECLARE @antes bigint =
       (SELECT ISNULL(MAX(id), 0) FROM dmc.visita_estado_historial WHERE visita_id = @id);

     UPDATE dmc.visita SET estado = @estado WHERE id = @id;

     IF EXISTS (SELECT 1 FROM dmc.visita_estado_historial WHERE visita_id = @id AND id > @antes)
       UPDATE dmc.visita_estado_historial
          SET motivo = @motivo, origen = @origen, usuario_id = @usuario
        WHERE visita_id = @id AND id > @antes;
     ELSE
       INSERT INTO dmc.visita_estado_historial (visita_id, estado, motivo, origen, usuario_id)
       VALUES (@id, @estado, @motivo, @origen, @usuario);`,
    [
      ["id", sql.BigInt, id],
      ["estado", sql.VarChar(12), estado],
      ["motivo", sql.NVarChar(sql.MAX), motivo],
      ["origen", sql.VarChar(6), origen],
      ["usuario", sql.BigInt, usuarioId],
    ]
  );
}

export interface DatosVisita {
  clienteId: number;
  sucursalId: number;
  tecnicoId: number;
  motivoCodigo: string;
  fechaProgramada: string;
  horaProgramada: string | null;
  trabajoSolicitado: string;
  indicacionesAcceso: string | null;
  responsableNombre: string | null;
  responsableTelefono: string | null;
  problemaOrigenId?: number | null;
  creadaEnTerreno?: boolean;
}

/** "Nueva visita" del panel y "Agregar visita" del celular. Nace PROGRAMADA. */
export async function crearVisita(datos: DatosVisita, creadaPor: number | null): Promise<Visita> {
  // El folio lo genera el DEFAULT de dmc.visita con la secuencia seq_folio_visita.
  const [fila] = await consultaCon<{ id: number; folio: string }>(
    `INSERT INTO dmc.visita
       (cliente_id, sucursal_id, tecnico_id, motivo_codigo, fecha_programada, hora_programada,
        trabajo_solicitado, indicaciones_acceso, responsable_nombre, responsable_telefono,
        problema_origen_id, creada_en_terreno, creada_por)
     VALUES (@cliente, @sucursal, @tecnico, @motivo, @fecha, @hora, @trabajo, @acceso,
             @responsable, @telefono, @problema, @terreno, @creadaPor);

     SELECT id, folio FROM dmc.visita WHERE id = SCOPE_IDENTITY();`,
    [
      ["cliente", sql.BigInt, datos.clienteId],
      ["sucursal", sql.BigInt, datos.sucursalId],
      ["tecnico", sql.BigInt, datos.tecnicoId],
      ["motivo", sql.VarChar(40), datos.motivoCodigo],
      ["fecha", sql.Date, datos.fechaProgramada],
      ["hora", sql.VarChar(8), datos.horaProgramada || null],
      ["trabajo", sql.NVarChar(sql.MAX), datos.trabajoSolicitado],
      ["acceso", sql.NVarChar(sql.MAX), datos.indicacionesAcceso],
      ["responsable", sql.NVarChar(120), datos.responsableNombre],
      ["telefono", sql.VarChar(30), datos.responsableTelefono],
      ["problema", sql.BigInt, datos.problemaOrigenId ?? null],
      ["terreno", sql.Bit, datos.creadaEnTerreno ?? false],
      ["creadaPor", sql.BigInt, creadaPor],
    ]
  );

  const id = num(fila.id);

  // La visita que nace de un problema queda enlazada: así el panel muestra el
  // problema como "agendado" y no lo vuelve a ofrecer.
  if (datos.problemaOrigenId) {
    await ejecutar(
      `IF NOT EXISTS (SELECT 1 FROM dmc.problema_visita_resolucion
                       WHERE problema_id = @problema AND visita_id = @visita)
         INSERT INTO dmc.problema_visita_resolucion (problema_id, visita_id, agendado_por)
         VALUES (@problema, @visita, @usuario)`,
      [
        ["problema", sql.BigInt, datos.problemaOrigenId],
        ["visita", sql.BigInt, id],
        ["usuario", sql.BigInt, creadaPor],
      ]
    );
  }

  const visita = await getVisitaCompleta(id);
  if (!visita) throw new Error(`La visita ${fila.folio} se creó pero no se pudo releer.`);
  return visita;
}

/** "Corregir visita" del acta. Si venía REAGENDADA vuelve a PROGRAMADA. */
export async function editarVisita(folio: string, datos: DatosVisita, usuarioId: number | null): Promise<boolean> {
  const [visita] = await consultaCon<{ id: number; estado: EstadoVisita }>(
    `SELECT id, estado FROM dmc.visita WHERE folio = @folio`,
    [["folio", sql.VarChar(16), folio]]
  );
  if (!visita) return false;
  const id = num(visita.id);

  await ejecutar(
    `UPDATE dmc.visita
        SET cliente_id = @cliente, sucursal_id = @sucursal, tecnico_id = @tecnico,
            motivo_codigo = @motivo, fecha_programada = @fecha, hora_programada = @hora,
            trabajo_solicitado = @trabajo, indicaciones_acceso = @acceso,
            responsable_nombre = @responsable, responsable_telefono = @telefono
      WHERE id = @id`,
    [
      ["cliente", sql.BigInt, datos.clienteId],
      ["sucursal", sql.BigInt, datos.sucursalId],
      ["tecnico", sql.BigInt, datos.tecnicoId],
      ["motivo", sql.VarChar(40), datos.motivoCodigo],
      ["fecha", sql.Date, datos.fechaProgramada],
      ["hora", sql.VarChar(8), datos.horaProgramada || null],
      ["trabajo", sql.NVarChar(sql.MAX), datos.trabajoSolicitado],
      ["acceso", sql.NVarChar(sql.MAX), datos.indicacionesAcceso],
      ["responsable", sql.NVarChar(120), datos.responsableNombre],
      ["telefono", sql.VarChar(30), datos.responsableTelefono],
      ["id", sql.BigInt, id],
    ]
  );

  if (visita.estado === "REAGENDADA") {
    await marcarEstado(id, "PROGRAMADA", "Corregida desde coordinación.", "WEB", usuarioId);
  }
  return true;
}

/** "Cambiar fecha y técnico": reagendadas, pendientes y canceladas. */
export async function reprogramarVisita(input: {
  folio: string;
  tecnicoId: number;
  fecha: string;
  hora: string | null;
  usuarioId: number | null;
}): Promise<boolean> {
  const [visita] = await consultaCon<{ id: number; fecha: string; hora: string | null; motivo: string | null }>(
    `SELECT v.id, ${F_FECHA("v.fecha_programada")} AS fecha, ${F_HORA("v.hora_programada")} AS hora,
            ${MOTIVO_PENDIENTE} AS motivo
       FROM dmc.visita v WHERE v.folio = @folio`,
    [["folio", sql.VarChar(16), input.folio]]
  );
  if (!visita) return false;
  const id = num(visita.id);

  await ejecutar(
    `INSERT INTO dmc.reagendamiento
       (visita_id, fecha_anterior, hora_anterior, fecha_nueva, hora_nueva, motivo, origen, usuario_id)
     VALUES (@id, @fechaAnt, @horaAnt, @fechaNue, @horaNue, @motivo, 'WEB', @usuario)`,
    [
      ["id", sql.BigInt, id],
      ["fechaAnt", sql.Date, visita.fecha],
      ["horaAnt", sql.VarChar(8), visita.hora],
      ["fechaNue", sql.Date, input.fecha],
      ["horaNue", sql.VarChar(8), input.hora || null],
      ["motivo", sql.NVarChar(sql.MAX), visita.motivo ?? "Reprogramada desde coordinación."],
      ["usuario", sql.BigInt, input.usuarioId],
    ]
  );

  await ejecutar(
    `UPDATE dmc.visita SET tecnico_id = @tecnico, fecha_programada = @fecha, hora_programada = @hora
      WHERE id = @id`,
    [
      ["tecnico", sql.BigInt, input.tecnicoId],
      ["fecha", sql.Date, input.fecha],
      ["hora", sql.VarChar(8), input.hora || null],
      ["id", sql.BigInt, id],
    ]
  );

  await marcarEstado(id, "PROGRAMADA", "Reprogramada desde coordinación.", "WEB", input.usuarioId);
  return true;
}

/** Cambio de estado y/o reclasificación de tipo desde "Problemas". */
export async function actualizarProblema(
  problemaId: number,
  estado: EstadoProblema,
  tipoCodigo: string,
  usuarioId: number | null
): Promise<boolean> {
  const [actual] = await consultaCon<{ estado: EstadoProblema; tipo_codigo: string }>(
    `SELECT estado, tipo_codigo FROM dmc.problema WHERE id = @id`,
    [["id", sql.BigInt, problemaId]]
  );
  if (!actual) return false;

  // resuelto_en lo maneja el trigger tg_problema_cambio, no se toca desde acá.
  await ejecutar(`UPDATE dmc.problema SET estado = @estado, tipo_codigo = @tipo WHERE id = @id`, [
    ["estado", sql.VarChar(10), estado],
    ["tipo", sql.VarChar(40), tipoCodigo],
    ["id", sql.BigInt, problemaId],
  ]);

  for (const [campo, antes, ahora] of [
    ["ESTADO", actual.estado, estado],
    ["TIPO", actual.tipo_codigo, tipoCodigo],
  ] as const) {
    if (antes === ahora) continue;
    await ejecutar(
      `INSERT INTO dmc.problema_historial (problema_id, campo, valor_anterior, valor_nuevo, usuario_id)
       VALUES (@id, @campo, @antes, @ahora, @usuario)`,
      [
        ["id", sql.BigInt, problemaId],
        ["campo", sql.VarChar(20), campo],
        ["antes", sql.NVarChar(40), antes],
        ["ahora", sql.NVarChar(40), ahora],
        ["usuario", sql.BigInt, usuarioId],
      ]
    );
  }
  return true;
}

// ── Envío del acta ──────────────────────────────────────────────────────────

export interface ActaEnviada {
  para: string;
  cc: string;
  adjuntos: number;
}

/**
 * Registra el envío del acta en dmc.acta_envio. Todavía no hay SMTP: la fila
 * queda ENCOLADO, que es justo el estado que el esquema define para eso.
 */
export async function registrarEnvioActa(input: {
  folio: string;
  para: string;
  cc: string;
  asunto: string;
  cuerpo: string;
  adjuntos: number;
  usuarioId: number | null;
}): Promise<boolean> {
  const [visita] = await consultaCon<{ id: number }>(`SELECT id FROM dmc.visita WHERE folio = @folio`, [
    ["folio", sql.VarChar(16), input.folio],
  ]);
  if (!visita) return false;

  await ejecutar(
    `INSERT INTO dmc.acta_envio (visita_id, para, cc, asunto, cuerpo, enviado_por)
     VALUES (@visita, @para, @cc, @asunto, @cuerpo, @usuario)`,
    [
      ["visita", sql.BigInt, num(visita.id)],
      ["para", sql.NVarChar(600), input.para],
      ["cc", sql.NVarChar(600), input.cc || null],
      ["asunto", sql.NVarChar(240), input.asunto],
      ["cuerpo", sql.NVarChar(sql.MAX), input.cuerpo],
      ["usuario", sql.BigInt, input.usuarioId],
    ]
  );
  return true;
}

export async function getActaEnviada(folio: string): Promise<ActaEnviada | null> {
  const [fila] = await consultaCon<{ para: string; cc: string | null; adjuntos: number }>(
    `SELECT TOP 1 e.para, e.cc,
            (SELECT COUNT(*) FROM dmc.acta_envio_adjunto a WHERE a.envio_id = e.id) AS adjuntos
       FROM dmc.acta_envio e
       JOIN dmc.visita v ON v.id = e.visita_id
      WHERE v.folio = @folio
      ORDER BY e.creado_en DESC, e.id DESC`,
    [["folio", sql.VarChar(16), folio]]
  );
  return fila ? { para: fila.para, cc: fila.cc ?? "", adjuntos: num(fila.adjuntos) } : null;
}
