import "server-only";
import { agrupar, consulta, consultaCon, ejecutar, num, sql, F_FECHA, F_TS, type Parametro } from "@/lib/data/sql";
import { hayGestionProblemas, listarGestionProblemas } from "@/lib/data/catalogos";
import type { GestionMarca } from "@/lib/data/pendientes";
import { hoyISO } from "@/lib/ui/fecha";
import type { CatalogoGestionProblema, EstadoProblema, EstadoVisita } from "@/lib/types";

// El panel "Problemas": cada falla levantada en terreno, agrupada por tienda,
// con lo que coordinación necesita para llevarla hasta el cierre — cuánto lleva
// abierta, qué pasos de gestión tiene marcados (Lista 6 del Checklist), su
// bitácora de cambios y qué más ha pasado en ese local. Los gráficos del panel
// se calculan en el navegador a partir de estas mismas filas.

/** Un cambio de estado o de tipo, tal como quedó en dmc.problema_historial. */
export interface CambioProblema {
  campo: "ESTADO" | "TIPO";
  antes: string;
  ahora: string;
  /** Lo que se escribió al hacer el cambio, si se escribió algo. */
  nota: string | null;
  por: string | null;
  en: string;
}

export interface ProblemaPanel {
  id: number;
  tipoCodigo: string;
  estado: EstadoProblema;
  descripcion: string | null;
  solucion: string | null;
  items: { id: number; etiqueta: string; cantidad: number }[];
  /** Cuándo lo levantó el técnico (al guardar el acta). */
  creadoEn: string;
  resueltoEn: string | null;
  /** Sin cerrar: días que lleva abierto. Resuelto: días que tardó en cerrarse. */
  dias: number;
  /** La visita donde se levantó. */
  visita: { folio: string; fechaProgramada: string; tecnico: string; motivo: string | null };
  /** La última visita agendada para resolverlo, si la hay. */
  agenda: { folio: string; fecha: string; tecnico: string; estado: EstadoVisita } | null;
  gestion: GestionMarca[];
  /** Del más viejo al más nuevo. */
  cambios: CambioProblema[];
}

/** Una visita del local, para leer qué más ha pasado ahí. */
export interface VisitaDeLocal {
  folio: string;
  fecha: string;
  estado: EstadoVisita;
  tecnico: string;
  motivo: string | null;
  /** Los trabajos realizados, ya con nombre y separados por " · ". */
  trabajos: string | null;
  observaciones: string | null;
}

export interface GrupoProblemas {
  sucursalId: number;
  nombre: string;
  cliente: string;
  clienteId: number;
  comuna: string;
  total: number;
  abiertos: number;
  /** Del más nuevo al más viejo. */
  items: ProblemaPanel[];
  /** Todas las visitas del local, de la más nueva a la más vieja. */
  visitas: VisitaDeLocal[];
}

export interface DatosProblemas {
  grupos: GrupoProblemas[];
  /** La Lista 6 del checklist, en su orden. */
  pasos: CatalogoGestionProblema[];
  /** false = falta la migración 015: no hay checklist que marcar. */
  conGestion: boolean;
  /** "Hoy" en Chile: la referencia de las antigüedades y de los gráficos. */
  hoy: string;
}

const diasEntre = (desde: string, hasta: string) =>
  Math.max(
    0,
    Math.round(
      (Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)) / 86_400_000
    )
  );

/** Solo los problemas de visitas vigentes: una visita eliminada se lleva los suyos. */
const DE_VISITA_ACTIVA = `SELECT p.id FROM dmc.problema p JOIN dmc.visita v ON v.id = p.visita_id WHERE v.activo = 1`;

export async function getPanelProblemas(): Promise<DatosProblemas> {
  interface Fila {
    id: number;
    tipo_codigo: string;
    estado: EstadoProblema;
    descripcion: string | null;
    solucion: string | null;
    creado_en: string;
    resuelto_en: string | null;
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
    agenda_estado: EstadoVisita | null;
  }

  const conGestion = await hayGestionProblemas();
  const [filas, items, cambios, marcas, visitas, pasos] = await Promise.all([
    consulta<Fila>(
      `SELECT p.id, p.tipo_codigo, p.estado, p.descripcion, p.solucion,
              ${F_TS("p.creado_en")} AS creado_en, ${F_TS("p.resuelto_en")} AS resuelto_en,
              v.folio, ${F_FECHA("v.fecha_programada")} AS fecha,
              t.nombre_completo AS tecnico, cm.nombre AS motivo,
              s.id AS sucursal_id, s.nombre AS sucursal, s.comuna,
              c.id AS cliente_id, c.nombre_fantasia AS cliente,
              ag.folio AS agenda_folio, ag.fecha AS agenda_fecha, ag.tecnico AS agenda_tecnico,
              ag.estado AS agenda_estado
         FROM dmc.problema p
         JOIN dmc.visita   v ON v.id = p.visita_id
         JOIN dmc.sucursal s ON s.id = v.sucursal_id
         JOIN dmc.cliente  c ON c.id = v.cliente_id
         JOIN dmc.tecnico  t ON t.id = v.tecnico_id
         LEFT JOIN dmc.catalogo_motivo cm ON cm.codigo = v.motivo_codigo
         OUTER APPLY (
           SELECT TOP 1 va.folio, ${F_FECHA("va.fecha_programada")} AS fecha,
                        ta.nombre_completo AS tecnico, va.estado
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
      `SELECT id, problema_id, etiqueta, cantidad FROM dmc.problema_item
        WHERE problema_id IN (${DE_VISITA_ACTIVA}) ORDER BY id`
    ),
    consulta<{
      problema_id: number;
      campo: "ESTADO" | "TIPO";
      valor_anterior: string;
      valor_nuevo: string;
      motivo: string | null;
      por: string | null;
      en: string;
    }>(
      `SELECT h.problema_id, h.campo, h.valor_anterior, h.valor_nuevo, h.motivo,
              COALESCE(tu.nombre_completo, u.email) AS por, ${F_TS("h.ocurrido_en")} AS en
         FROM dmc.problema_historial h
         LEFT JOIN dmc.usuario u  ON u.id  = h.usuario_id
         LEFT JOIN dmc.tecnico tu ON tu.id = u.tecnico_id
        WHERE h.problema_id IN (${DE_VISITA_ACTIVA})
        ORDER BY h.ocurrido_en, h.id`
    ),
    conGestion
      ? consulta<{ problema_id: number; codigo: string; en: string; por: string | null }>(
          `SELECT g.problema_id, g.gestion_codigo AS codigo, ${F_TS("g.marcado_en")} AS en,
                  COALESCE(tu.nombre_completo, u.email) AS por
             FROM dmc.problema_gestion g
             LEFT JOIN dmc.usuario u  ON u.id  = g.usuario_id
             LEFT JOIN dmc.tecnico tu ON tu.id = u.tecnico_id
            WHERE g.problema_id IN (${DE_VISITA_ACTIVA})
            ORDER BY g.marcado_en, g.id`
        )
      : [],
    // Las visitas de los locales que alguna vez tuvieron un problema.
    consulta<{
      sucursal_id: number;
      folio: string;
      fecha: string;
      estado: EstadoVisita;
      tecnico: string;
      motivo: string | null;
      observaciones: string | null;
      trabajos: string | null;
    }>(
      `SELECT v.sucursal_id, v.folio, ${F_FECHA("v.fecha_programada")} AS fecha, v.estado,
              t.nombre_completo AS tecnico, cm.nombre AS motivo, e.observaciones,
              (SELECT STRING_AGG(CAST(ISNULL(ct.nombre, w.trabajo_codigo) AS nvarchar(max)), N' · ')
                        WITHIN GROUP (ORDER BY w.orden, w.id)
                 FROM dmc.visita_trabajo w
                 LEFT JOIN dmc.catalogo_trabajo ct ON ct.codigo = w.trabajo_codigo
                WHERE w.visita_id = v.id AND w.activo = 1) AS trabajos
         FROM dmc.visita v
         JOIN dmc.tecnico t ON t.id = v.tecnico_id
         LEFT JOIN dmc.catalogo_motivo cm ON cm.codigo = v.motivo_codigo
         LEFT JOIN dmc.visita_ejecucion e ON e.visita_id = v.id
        WHERE v.activo = 1
          AND v.sucursal_id IN (SELECT v2.sucursal_id
                                  FROM dmc.problema p2
                                  JOIN dmc.visita v2 ON v2.id = p2.visita_id
                                 WHERE v2.activo = 1)
        ORDER BY v.fecha_programada DESC, v.id DESC`
    ),
    listarGestionProblemas(),
  ]);

  const hoy = hoyISO();
  const itemsPorProblema = agrupar(items, (i) => num(i.problema_id));
  const cambiosPorProblema = agrupar(cambios, (c) => num(c.problema_id));
  const marcasPorProblema = agrupar(marcas, (m) => num(m.problema_id));
  const visitasPorSucursal = agrupar(visitas, (v) => num(v.sucursal_id));
  const vigentes = new Set(pasos.map((p) => p.codigo));
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
      visitas: (visitasPorSucursal.get(sucursalId) ?? []).map((v) => ({
        folio: v.folio,
        fecha: v.fecha,
        estado: v.estado,
        tecnico: v.tecnico,
        motivo: v.motivo,
        trabajos: v.trabajos,
        observaciones: v.observaciones,
      })),
    };

    const id = num(f.id);
    grupo.items.push({
      id,
      tipoCodigo: f.tipo_codigo,
      estado: f.estado,
      descripcion: f.descripcion,
      solucion: f.solucion,
      items: (itemsPorProblema.get(id) ?? []).map((i) => ({
        id: num(i.id),
        etiqueta: i.etiqueta,
        cantidad: i.cantidad,
      })),
      creadoEn: f.creado_en,
      resueltoEn: f.resuelto_en,
      dias: diasEntre(f.creado_en, f.resuelto_en ?? hoy),
      visita: { folio: f.folio, fechaProgramada: f.fecha, tecnico: f.tecnico, motivo: f.motivo },
      agenda:
        f.agenda_folio && f.agenda_fecha
          ? {
              folio: f.agenda_folio,
              fecha: f.agenda_fecha,
              tecnico: f.agenda_tecnico ?? "—",
              estado: f.agenda_estado ?? "PROGRAMADA",
            }
          : null,
      // Solo los pasos que siguen en el checklist.
      gestion: (marcasPorProblema.get(id) ?? [])
        .filter((m) => vigentes.has(m.codigo))
        .map((m) => ({ codigo: m.codigo, por: m.por, en: m.en })),
      cambios: (cambiosPorProblema.get(id) ?? []).map((c) => ({
        campo: c.campo,
        antes: c.valor_anterior,
        ahora: c.valor_nuevo,
        nota: c.motivo,
        por: c.por,
        en: c.en,
      })),
    });

    grupo.total += 1;
    if (f.estado !== "RESUELTO") grupo.abiertos += 1;
    grupos.set(sucursalId, grupo);
  }

  return {
    grupos: [...grupos.values()].sort((a, b) => b.abiertos - a.abiertos || b.total - a.total),
    pasos,
    conGestion,
    hoy,
  };
}

/**
 * Marca o desmarca un paso del checklist de gestión en un problema.
 *
 * Un problema resuelto ya no se gestiona: lo marcado queda como registro de
 * cómo se llegó a cerrarlo. Devuelve por qué no se pudo, o null si quedó.
 */
export async function marcarGestionProblema(input: {
  problemaId: number;
  codigo: string;
  marcado: boolean;
  usuarioId: number;
}): Promise<{ error: string } | null> {
  if (!(await hayGestionProblemas())) {
    return { error: "Para marcar la gestión falta correr la migración 015 en la base." };
  }

  const [problema] = await consultaCon<{ estado: EstadoProblema }>(
    `SELECT p.estado FROM dmc.problema p JOIN dmc.visita v ON v.id = p.visita_id
      WHERE p.id = @id AND v.activo = 1`,
    [["id", sql.BigInt, input.problemaId]]
  );
  if (!problema) return { error: "No encontramos ese problema." };
  if (problema.estado === "RESUELTO") {
    return { error: "Ese problema ya está resuelto: su gestión quedó cerrada. Recarga la página." };
  }

  const params: Parametro[] = [
    ["problema", sql.BigInt, input.problemaId],
    ["codigo", sql.VarChar(40), input.codigo],
    ["usuario", sql.BigInt, input.usuarioId],
  ];

  if (!input.marcado) {
    await ejecutar(
      `DELETE FROM dmc.problema_gestion WHERE problema_id = @problema AND gestion_codigo = @codigo`,
      params
    );
    return null;
  }

  const [paso] = await consultaCon<{ id: number }>(
    `SELECT id FROM dmc.catalogo_problema_gestion WHERE codigo = @codigo AND activo = 1`,
    [["codigo", sql.VarChar(40), input.codigo]]
  );
  if (!paso) return { error: "Ese paso ya no está en el checklist: recarga la página." };

  // Dos pestañas marcando lo mismo: la segunda no choca con la unicidad.
  await ejecutar(
    `IF NOT EXISTS (SELECT 1 FROM dmc.problema_gestion
                     WHERE problema_id = @problema AND gestion_codigo = @codigo)
       INSERT INTO dmc.problema_gestion (problema_id, gestion_codigo, usuario_id)
       VALUES (@problema, @codigo, @usuario);`,
    params
  );
  return null;
}
