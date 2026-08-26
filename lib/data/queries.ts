import "server-only";
import { agrupar, consulta, consultaCon, num, sql, F_FECHA } from "@/lib/data/sql";
import { inicioMes, inicioSemana, sumarDias } from "@/lib/ui/fecha";
import type { EstadoProblema, EstadoVisita } from "@/lib/types";

// Consultas agregadas del panel de coordinación. Donde el esquema ya trae una
// vista para el cálculo (sección 10 del DDL) se usa esa vista en vez de rehacer
// la agregación acá: v_cumplimiento_dia, v_carga_tecnico y v_sucursal_fallas.

export type Rango = "Hoy" | "Semana" | "Mes";

/** Ventana [desde, hasta] que cubre el rango, tomando `hoy` como referencia. */
export function rangoFechas(rango: Rango, hoy: string): { desde: string; hasta: string } {
  if (rango === "Hoy") return { desde: hoy, hasta: hoy };
  if (rango === "Semana") {
    const desde = inicioSemana(hoy);
    return { desde, hasta: sumarDias(desde, 6) };
  }
  const desde = inicioMes(hoy);
  // Primer día del mes siguiente, menos un día.
  const [a, m] = desde.split("-").map(Number);
  const siguiente = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  return { desde, hasta: sumarDias(siguiente, -1) };
}

// ── Visitas del rango (solo lo que el panel necesita contar) ────────────────

export interface VisitaResumen {
  id: number;
  folio: string;
  estado: EstadoVisita;
  fechaProgramada: string;
  tecnicoId: number;
}

export async function getVisitasRango(rango: Rango, hoy: string): Promise<VisitaResumen[]> {
  const { desde, hasta } = rangoFechas(rango, hoy);
  const filas = await consultaCon<{
    id: number;
    folio: string;
    estado: EstadoVisita;
    fecha: string;
    tecnico_id: number;
  }>(
    `SELECT id, folio, estado, ${F_FECHA("fecha_programada")} AS fecha, tecnico_id
       FROM dmc.visita
      WHERE fecha_programada BETWEEN @desde AND @hasta AND activo = 1`,
    [
      ["desde", sql.Date, desde],
      ["hasta", sql.Date, hasta],
    ]
  );
  return filas.map((f) => ({
    id: num(f.id),
    folio: f.folio,
    estado: f.estado,
    fechaProgramada: f.fecha,
    tecnicoId: num(f.tecnico_id),
  }));
}

export async function contarVisitas(): Promise<number> {
  const [f] = await consulta<{ n: number }>(`SELECT COUNT(*) AS n FROM dmc.visita WHERE activo = 1`);
  return num(f?.n ?? 0);
}

export async function contarReagendasPendientes(): Promise<number> {
  const [f] = await consulta<{ n: number }>(
    `SELECT COUNT(*) AS n FROM dmc.visita WHERE estado IN ('REAGENDADA', 'PENDIENTE') AND activo = 1`
  );
  return num(f?.n ?? 0);
}

export async function contarProblemasAbiertos(): Promise<number> {
  const [f] = await consulta<{ n: number }>(
    `SELECT COUNT(*) AS n
       FROM dmc.problema p
       JOIN dmc.visita   v ON v.id = p.visita_id
      WHERE p.estado <> 'RESUELTO' AND v.activo = 1`
  );
  return num(f?.n ?? 0);
}

// ── Cumplimiento (vista v_cumplimiento_dia) ─────────────────────────────────

export interface CumplimientoDia {
  fecha: string;
  programadas: number;
  cerradas: number;
  pct: number;
}

export async function getCumplimientoRango(desde: string, hasta: string): Promise<CumplimientoDia[]> {
  const filas = await consultaCon<{ fecha: string; programadas: number; cerradas: number; pct: number }>(
    `SELECT ${F_FECHA("fecha_programada")} AS fecha, programadas, cerradas, ISNULL(pct, 0) AS pct
       FROM dmc.v_cumplimiento_dia
      WHERE fecha_programada BETWEEN @desde AND @hasta
      ORDER BY fecha_programada`,
    [
      ["desde", sql.Date, desde],
      ["hasta", sql.Date, hasta],
    ]
  );
  return filas.map((f) => ({
    fecha: f.fecha,
    programadas: num(f.programadas),
    cerradas: num(f.cerradas),
    pct: num(f.pct),
  }));
}

// ── Distribución por estado ─────────────────────────────────────────────────

const ORDEN_ESTADOS: EstadoVisita[] = [
  "COMPLETADA",
  "EN_CURSO",
  "PROGRAMADA",
  "PENDIENTE",
  "REAGENDADA",
  "CANCELADA",
  "CANCELADA_ADMIN",
];

export async function getEstadoHoyDistribucion(hoy: string): Promise<{ estado: EstadoVisita; n: number; pct: number }[]> {
  const filas = await consultaCon<{ estado: EstadoVisita; n: number }>(
    `SELECT estado, COUNT(*) AS n FROM dmc.visita WHERE fecha_programada = @hoy AND activo = 1 GROUP BY estado`,
    [["hoy", sql.Date, hoy]]
  );
  const total = filas.reduce((acc, f) => acc + num(f.n), 0);
  const porEstado = new Map(filas.map((f) => [f.estado, num(f.n)]));
  return ORDEN_ESTADOS.map((estado) => {
    const n = porEstado.get(estado) ?? 0;
    return { estado, n, pct: total ? Math.round((100 * n) / total) : 0 };
  }).filter((e) => e.n > 0);
}

// ── Problemas por tipo ──────────────────────────────────────────────────────

export async function getProblemasPorTipo(): Promise<{ codigo: string; nombre: string; n: number; pct: number }[]> {
  const filas = await consulta<{ codigo: string; nombre: string; n: number }>(
    `SELECT p.tipo_codigo AS codigo, ISNULL(c.nombre, p.tipo_codigo) AS nombre, COUNT(*) AS n
       FROM dmc.problema p
       JOIN dmc.visita v ON v.id = p.visita_id
       LEFT JOIN dmc.catalogo_problema c ON c.codigo = p.tipo_codigo
      WHERE p.estado <> 'RESUELTO' AND v.activo = 1
      GROUP BY p.tipo_codigo, c.nombre
      ORDER BY COUNT(*) DESC`
  );
  const total = filas.reduce((acc, f) => acc + num(f.n), 0);
  return filas.map((f) => ({
    codigo: f.codigo,
    nombre: f.nombre,
    n: num(f.n),
    pct: total ? Math.round((100 * num(f.n)) / total) : 0,
  }));
}

// ── Carga por técnico (vista v_carga_tecnico) ───────────────────────────────

export interface CargaTecnico {
  tecnicoId: number;
  nombre: string;
  programadas: number;
  realizadas: number;
  noRealizadas: number;
}

export async function getCargaTecnico(hoy: string): Promise<CargaTecnico[]> {
  const filas = await consultaCon<{
    tecnico_id: number;
    tecnico: string;
    programadas: number;
    realizadas: number;
    no_realizadas: number;
  }>(
    `SELECT tecnico_id, tecnico, programadas, realizadas, no_realizadas
       FROM dmc.v_carga_tecnico WHERE fecha_programada = @hoy ORDER BY tecnico`,
    [["hoy", sql.Date, hoy]]
  );
  return filas.map((f) => ({
    tecnicoId: num(f.tecnico_id),
    nombre: f.tecnico,
    programadas: num(f.programadas),
    realizadas: num(f.realizadas),
    noRealizadas: num(f.no_realizadas),
  }));
}

// ── Sucursales con más fallas (vista v_sucursal_fallas) ─────────────────────

export interface SucursalFallas {
  sucursalId: number;
  total: number;
  sinCerrar: number;
  sucursal: { nombre: string; comuna: string };
}

export async function getSucursalFallas(limite = 5): Promise<SucursalFallas[]> {
  const filas = await consultaCon<{
    sucursal_id: number;
    sucursal: string;
    comuna: string;
    total: number;
    sin_cerrar: number;
  }>(
    `SELECT TOP (@limite) sucursal_id, sucursal, comuna, total, sin_cerrar
       FROM dmc.v_sucursal_fallas ORDER BY sin_cerrar DESC, total DESC`,
    [["limite", sql.Int, limite]]
  );
  return filas.map((f) => ({
    sucursalId: num(f.sucursal_id),
    total: num(f.total),
    sinCerrar: num(f.sin_cerrar),
    sucursal: { nombre: f.sucursal, comuna: f.comuna },
  }));
}

// ── Tiempo en sitio ─────────────────────────────────────────────────────────

export async function getTiempoEnSitio(): Promise<{
  prom: number;
  porMotivo: { label: string; min: number; pct: number }[];
}> {
  const [general] = await consulta<{ prom: number | null }>(
    `SELECT AVG(CAST(DATEDIFF(minute, e.hora_inicio, e.hora_termino) AS float)) AS prom
       FROM dmc.visita_ejecucion e
       JOIN dmc.visita v ON v.id = e.visita_id
      WHERE e.hora_termino IS NOT NULL AND v.activo = 1`
  );

  const filas = await consulta<{ label: string; min: number }>(
    `SELECT ISNULL(c.nombre, e.motivo_real_codigo) AS label,
            AVG(CAST(DATEDIFF(minute, e.hora_inicio, e.hora_termino) AS float)) AS [min]
       FROM dmc.visita_ejecucion e
       JOIN dmc.visita v ON v.id = e.visita_id
       LEFT JOIN dmc.catalogo_motivo c ON c.codigo = e.motivo_real_codigo
      WHERE e.hora_termino IS NOT NULL AND e.motivo_real_codigo IS NOT NULL AND v.activo = 1
      GROUP BY e.motivo_real_codigo, c.nombre`
  );

  const lista = filas
    .map((f) => ({ label: f.label, min: Math.round(num(f.min)) }))
    .sort((a, b) => b.min - a.min);
  const max = Math.max(1, ...lista.map((x) => x.min));

  return {
    prom: general?.prom === null || general?.prom === undefined ? 0 : Math.round(num(general.prom)),
    porMotivo: lista.map((x) => ({ ...x, pct: Math.round((100 * x.min) / max) })),
  };
}

// ── Reagendamientos recientes ───────────────────────────────────────────────

export interface ReagendaResumen {
  reagendamiento: { id: number; motivo: string };
  visita: { folio: string; sucursal: { nombre: string } };
}

export async function getReagendas(limite = 5): Promise<ReagendaResumen[]> {
  const filas = await consultaCon<{ id: number; motivo: string; folio: string; sucursal: string }>(
    `SELECT TOP (@limite) r.id, r.motivo, v.folio, s.nombre AS sucursal
       FROM dmc.reagendamiento r
       JOIN dmc.visita   v ON v.id = r.visita_id
       JOIN dmc.sucursal s ON s.id = v.sucursal_id
      WHERE v.activo = 1
      ORDER BY r.creado_en DESC, r.id DESC`,
    [["limite", sql.Int, limite]]
  );
  return filas.map((f) => ({
    reagendamiento: { id: num(f.id), motivo: f.motivo },
    visita: { folio: f.folio, sucursal: { nombre: f.sucursal } },
  }));
}

// ── Problemas agrupados por sucursal (vista "Problemas" del panel) ──────────

export interface ItemProblema {
  problema: {
    id: number;
    tipoCodigo: string;
    estado: EstadoProblema;
    descripcion: string | null;
    solucion: string | null;
    items: { id: number; etiqueta: string; cantidad: number }[];
  };
  visita: {
    folio: string;
    fechaProgramada: string;
    tecnico?: { nombreCompleto: string };
    motivo?: { nombre: string };
  };
  agenda: { folio: string; fecha: string; tecnico: string } | null;
}

export interface GrupoProblemas {
  sucursalId: number;
  nombre: string;
  cliente: string;
  clienteId: number;
  comuna: string;
  total: number;
  abiertos: number;
  items: ItemProblema[];
}

export async function getProblemasPorSucursal(): Promise<GrupoProblemas[]> {
  interface Fila {
    id: number;
    tipo_codigo: string;
    estado: EstadoProblema;
    descripcion: string | null;
    solucion: string | null;
    folio: string;
    fecha: string;
    tecnico: string;
    motivo: string | null;
    sucursal_id: number;
    sucursal: string;
    comuna: string;
    cliente_id: number;
    cliente: string;
    agenda_folio: string | null;
    agenda_fecha: string | null;
    agenda_tecnico: string | null;
  }

  const [filas, items] = await Promise.all([
    consulta<Fila>(
      `SELECT p.id, p.tipo_codigo, p.estado, p.descripcion, p.solucion,
              v.folio, ${F_FECHA("v.fecha_programada")} AS fecha,
              t.nombre_completo AS tecnico, cm.nombre AS motivo,
              s.id AS sucursal_id, s.nombre AS sucursal, s.comuna,
              c.id AS cliente_id, c.nombre_fantasia AS cliente,
              ag.folio AS agenda_folio, ag.fecha AS agenda_fecha, ag.tecnico AS agenda_tecnico
         FROM dmc.problema p
         JOIN dmc.visita   v ON v.id = p.visita_id
         JOIN dmc.sucursal s ON s.id = v.sucursal_id
         JOIN dmc.cliente  c ON c.id = v.cliente_id
         JOIN dmc.tecnico  t ON t.id = v.tecnico_id
         LEFT JOIN dmc.catalogo_motivo cm ON cm.codigo = v.motivo_codigo
         OUTER APPLY (
           SELECT TOP 1 va.folio, ${F_FECHA("va.fecha_programada")} AS fecha, ta.nombre_completo AS tecnico
             FROM dmc.problema_visita_resolucion r
             JOIN dmc.visita  va ON va.id = r.visita_id
             JOIN dmc.tecnico ta ON ta.id = va.tecnico_id
            WHERE r.problema_id = p.id AND va.activo = 1
            ORDER BY va.fecha_programada DESC, va.id DESC
         ) AS ag
        WHERE v.activo = 1
        ORDER BY p.creado_en DESC, p.id DESC`
    ),
    consulta<{ id: number; problema_id: number; etiqueta: string; cantidad: number }>(
      `SELECT id, problema_id, etiqueta, cantidad FROM dmc.problema_item ORDER BY id`
    ),
  ]);

  const itemsPorProblema = agrupar(items, (i) => num(i.problema_id));
  const grupos = new Map<number, GrupoProblemas>();

  for (const f of filas) {
    const sucursalId = num(f.sucursal_id);
    const grupo = grupos.get(sucursalId) ?? {
      sucursalId,
      nombre: f.sucursal,
      cliente: f.cliente,
      clienteId: num(f.cliente_id),
      comuna: f.comuna,
      total: 0,
      abiertos: 0,
      items: [],
    };

    grupo.items.push({
      problema: {
        id: num(f.id),
        tipoCodigo: f.tipo_codigo,
        estado: f.estado,
        descripcion: f.descripcion,
        solucion: f.solucion,
        items: (itemsPorProblema.get(num(f.id)) ?? []).map((i) => ({
          id: num(i.id),
          etiqueta: i.etiqueta,
          cantidad: i.cantidad,
        })),
      },
      visita: {
        folio: f.folio,
        fechaProgramada: f.fecha,
        tecnico: { nombreCompleto: f.tecnico },
        motivo: f.motivo ? { nombre: f.motivo } : undefined,
      },
      agenda:
        f.agenda_folio && f.agenda_fecha
          ? { folio: f.agenda_folio, fecha: f.agenda_fecha, tecnico: f.agenda_tecnico ?? "—" }
          : null,
    });

    grupo.total += 1;
    if (f.estado !== "RESUELTO") grupo.abiertos += 1;
    grupos.set(sucursalId, grupo);
  }

  return [...grupos.values()].sort((a, b) => b.abiertos - a.abiertos);
}
