import {
  getVisitasRango,
  getCumplimientoRango,
  getProblemasAbiertos,
  getProblemasPorTipo,
  getCargaTecnico,
  getSucursalFallas,
  getTiempoEnSitio,
  getReagendas,
  getEstadoHoyDistribucion,
  HOY,
} from "@/lib/mock/queries";
import { getTecnicoById } from "@/lib/mock/maestros";
import { ESTADO_VISITA_COLOR, ESTADO_VISITA_LABEL } from "@/lib/ui/estado";
import type { EstadoVisita } from "@/lib/types";

export type Rango = "Hoy" | "Semana" | "Mes";

function inicioSemana(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`);
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

export function buildPanelData(rango: Rango) {
  const visitas = getVisitasRango(rango, HOY);
  const programadas = visitas.length;
  const cerradas = visitas.filter((v) => v.estado === "COMPLETADA").length;
  const pctCumpl = programadas ? Math.round((100 * cerradas) / programadas) : 0;
  const reagendas = visitas.filter((v) => v.estado === "REAGENDADA" || v.estado === "PENDIENTE").length;
  const tecnicosHoy = new Set(getVisitasRango("Hoy", HOY).map((v) => v.tecnicoId)).size;
  const problemasAbiertos = getProblemasAbiertos();

  const desde = rango === "Mes" ? `${HOY.slice(0, 7)}-01` : rango === "Semana" ? inicioSemana(HOY) : HOY;
  // Los días sin visitas programadas no entran al gráfico: no se trabajó, así
  // que una barra en 0 solo ensuciaría la lectura del cumplimiento.
  const dias = getCumplimientoRango(desde, HOY).filter((d) => d.programadas > 0);

  return {
    rango,
    kpis: {
      programadas,
      cerradas,
      pctCumpl,
      reagendas,
      tecnicosHoy,
      problemasAbiertosTotal: problemasAbiertos.length,
    },
    estadoHoy: getEstadoHoyDistribucion(HOY).map((e) => ({
      estado: e.estado as EstadoVisita,
      label: ESTADO_VISITA_LABEL[e.estado as EstadoVisita],
      color: ESTADO_VISITA_COLOR[e.estado as EstadoVisita],
      n: e.n,
      pct: e.pct,
    })),
    totalHoy: getVisitasRango("Hoy", HOY).length,
    cumplimiento: {
      pct: pctCumpl,
      meta: 92,
      detalle: `${cerradas} de ${programadas} visitas cerradas dentro de la fecha programada.`,
      rangoTexto:
        rango === "Hoy"
          ? `Hoy · ${HOY}`
          : rango === "Semana"
            ? "Semana en curso"
            : new Date(`${HOY}T00:00:00`).toLocaleDateString("es-CL", { month: "long", year: "numeric" }),
      dias: dias.map((d) => ({
        fecha: d.fecha,
        pct: d.pct,
        pctTxt: `${d.pct}%`,
        programadas: d.programadas,
        cerradas: d.cerradas,
        esHoy: d.fecha === HOY,
        // La barra mide el cumplimiento del día, no cuántas visitas hubo.
        h: Math.max(2, d.pct),
        label: new Date(`${d.fecha}T00:00:00`)
          .toLocaleDateString("es-CL", { weekday: "short", day: "2-digit" })
          .replace(".", ""),
      })),
    },
    problemasTipo: getProblemasPorTipo(),
    carga: getCargaTecnico(HOY).map((c) => ({
      ...c,
      nombre: getTecnicoById(c.tecnicoId)?.nombreCompleto ?? "—",
      pct: c.programadas ? Math.round((100 * c.realizadas) / c.programadas) : 0,
    })),
    sucursalesFallas: getSucursalFallas()
      .sort((a, b) => b.sinCerrar - a.sinCerrar)
      .slice(0, 5),
    tiempo: getTiempoEnSitio(),
    reagendasLista: getReagendas().slice(0, 5),
  };
}

export type PanelData = ReturnType<typeof buildPanelData>;
