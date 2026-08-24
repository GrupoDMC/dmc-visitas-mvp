import "server-only";
import { consultaCon, num, sql, F_FECHA } from "@/lib/data/sql";
import { ESTADO_PROBLEMA_LABEL, ESTADO_PROBLEMA_TAG, type TagVariant } from "@/lib/ui/estado";
import type { EstadoProblema } from "@/lib/types";

// "Última visita al local" del detalle móvil: qué dejó registrado la visita
// anterior en esa misma sucursal. Antes era un objeto fijo en lib/mock/historial;
// ahora es la última visita cerrada de la sucursal, distinta de la que se abre.

export interface HistorialProblema {
  tipo: string;
  detalle: string;
  estado: string;
  tag: TagVariant;
}

export interface HistorialVista {
  hay: boolean;
  encabezado: string;
  trabajos: string[];
  obs: string;
  problemas: HistorialProblema[];
  sinProblemas: boolean;
}

const SIN_HISTORIAL: HistorialVista = {
  hay: false,
  encabezado: "Sin historial",
  trabajos: [],
  obs: "",
  problemas: [],
  sinProblemas: true,
};

function aFechaChilena(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export async function getHistorialLocal(sucursalId: number | undefined, excluirVisitaId: number): Promise<HistorialVista> {
  if (!sucursalId) return SIN_HISTORIAL;

  const [anterior] = await consultaCon<{
    id: number;
    fecha: string;
    tecnico: string;
    observaciones: string | null;
  }>(
    `SELECT TOP 1 v.id, ${F_FECHA("v.fecha_programada")} AS fecha,
            t.nombre_completo AS tecnico, e.observaciones
       FROM dmc.visita v
       JOIN dmc.tecnico t ON t.id = v.tecnico_id
       LEFT JOIN dmc.visita_ejecucion e ON e.visita_id = v.id
      WHERE v.sucursal_id = @sucursal
        AND v.id <> @excluir
        AND v.estado IN ('COMPLETADA', 'PENDIENTE')
      ORDER BY v.fecha_programada DESC, v.hora_programada DESC, v.id DESC`,
    [
      ["sucursal", sql.BigInt, sucursalId],
      ["excluir", sql.BigInt, excluirVisitaId],
    ]
  );

  if (!anterior) return SIN_HISTORIAL;
  const visitaId = num(anterior.id);

  const [trabajos, problemas] = await Promise.all([
    consultaCon<{ nombre: string }>(
      `SELECT ISNULL(c.nombre, w.trabajo_codigo) AS nombre
         FROM dmc.visita_trabajo w
         LEFT JOIN dmc.catalogo_trabajo c ON c.codigo = w.trabajo_codigo
        WHERE w.visita_id = @visita ORDER BY w.orden, w.id`,
      [["visita", sql.BigInt, visitaId]]
    ),
    consultaCon<{ tipo: string; estado: EstadoProblema; descripcion: string | null; solucion: string | null }>(
      `SELECT ISNULL(c.nombre, p.tipo_codigo) AS tipo, p.estado, p.descripcion, p.solucion
         FROM dmc.problema p
         LEFT JOIN dmc.catalogo_problema c ON c.codigo = p.tipo_codigo
        WHERE p.visita_id = @visita AND p.estado <> 'RESUELTO'
        ORDER BY p.orden, p.id`,
      [["visita", sql.BigInt, visitaId]]
    ),
  ]);

  return {
    hay: true,
    encabezado: `${aFechaChilena(anterior.fecha)} · ${anterior.tecnico}`,
    trabajos: trabajos.map((t) => t.nombre),
    obs: anterior.observaciones ?? "",
    problemas: problemas.map((p) => ({
      tipo: p.tipo,
      detalle: [p.descripcion, p.solucion].filter(Boolean).join(" "),
      estado: ESTADO_PROBLEMA_LABEL[p.estado],
      tag: ESTADO_PROBLEMA_TAG[p.estado],
    })),
    sinProblemas: problemas.length === 0,
  };
}
