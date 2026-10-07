import { ESTADO_PROBLEMA_CIERRE, textoMotivos } from "@/lib/ui/estado";
import type { EstadoVisita, Mall, Sucursal, Visita } from "@/lib/types";

/**
 * Lo que la ficha de una tienda o de un cliente necesita de cada visita. Se
 * arma en el servidor: la visita completa (fotos, firmas, trabajos…) no viaja
 * al navegador solo para contar y listar.
 */
export interface FilaFicha {
  id: number;
  folio: string;
  fecha: string;
  fechaHasta: string | null;
  hora: string | null;
  estado: EstadoVisita;
  motivos: string;
  /** Cada motivo por separado, para el gráfico de los más frecuentes. */
  motivosLista: string[];
  tecnico: string;
  ayudante: string | null;
  tiendaId: number;
  tienda: string;
  cliente: string;
  mall: string | null;
  problemas: number;
  problemasAbiertos: number;
  /** Minutos en sitio según el acta; null si no hay acta cerrada. */
  minutos: number | null;
}

export interface DatoFicha {
  label: string;
  valor: string;
  href?: string;
}

const aMs = (ts: string) => Date.parse(ts.includes("T") ? ts : ts.replace(" ", "T"));

export function aFilas(visitas: Visita[], malls: Mall[], sucursales: Sucursal[]): FilaFicha[] {
  return visitas.map((v) => {
    const s = v.sucursal ?? sucursales.find((x) => x.id === v.sucursalId);
    const ini = v.ejecucion?.horaInicio ? aMs(v.ejecucion.horaInicio) : NaN;
    const fin = v.ejecucion?.horaTermino ? aMs(v.ejecucion.horaTermino) : NaN;
    const minutos = Number.isFinite(ini) && Number.isFinite(fin) && fin > ini ? Math.round((fin - ini) / 60000) : null;
    const problemas = v.problemas ?? [];
    const lista = v.motivosNombres.filter(Boolean);
    return {
      id: v.id,
      folio: v.folio,
      fecha: v.fechaProgramada,
      fechaHasta: v.fechaHasta,
      hora: v.horaProgramada,
      estado: v.estado,
      motivos: textoMotivos(v),
      motivosLista: lista.length ? lista : [v.motivo?.nombre ?? v.motivoCodigo],
      tecnico: v.tecnico?.nombreCompleto ?? "—",
      ayudante: v.tecnicoAyudante?.nombreCompleto ?? null,
      tiendaId: v.sucursalId,
      tienda: s?.nombre ?? "—",
      cliente: v.cliente?.nombreFantasia ?? "—",
      mall: malls.find((m) => m.id === s?.mallId)?.nombre ?? null,
      problemas: problemas.length,
      problemasAbiertos: problemas.filter((p) => p.estado !== ESTADO_PROBLEMA_CIERRE).length,
      // Más de 12 horas es un acta que quedó abierta de un día para otro: no es tiempo en sitio.
      minutos: minutos !== null && minutos <= 720 ? minutos : null,
    };
  });
}
