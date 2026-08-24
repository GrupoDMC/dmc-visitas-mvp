import "server-only";
import {
  contarProblemasAbiertos,
  getCargaTecnico,
  getCumplimientoRango,
  getEstadoHoyDistribucion,
  getProblemasPorTipo,
  getReagendas,
  getSucursalFallas,
  getTiempoEnSitio,
  getVisitasRango,
  rangoFechas,
  type Rango,
} from "@/lib/data/queries";
import { hoyISO, inicioMes, inicioSemana } from "@/lib/ui/fecha";
import { ESTADO_VISITA_COLOR, ESTADO_VISITA_LABEL } from "@/lib/ui/estado";

export type { Rango };

export async function buildPanelData(rango: Rango, hoy: string = hoyISO()) {
  const [visitas, visitasHoy, problemasAbiertosTotal] = await Promise.all([
    getVisitasRango(rango, hoy),
    rango === "Hoy" ? Promise.resolve(null) : getVisitasRango("Hoy", hoy),
    contarProblemasAbiertos(),
  ]);
  const deHoy = visitasHoy ?? visitas;

  const programadas = visitas.length;
  const cerradas = visitas.filter((v) => v.estado === "COMPLETADA").length;
  const pctCumpl = programadas ? Math.round((100 * cerradas) / programadas) : 0;
  const reagendas = visitas.filter((v) => v.estado === "REAGENDADA" || v.estado === "PENDIENTE").length;
  const tecnicosHoy = new Set(deHoy.map((v) => v.tecnicoId)).size;

  const desde = rango === "Mes" ? inicioMes(hoy) : rango === "Semana" ? inicioSemana(hoy) : hoy;

  const [dias, estadoHoy, problemasTipo, carga, sucursalesFallas, tiempo, reagendasLista] = await Promise.all([
    getCumplimientoRango(desde, hoy),
    getEstadoHoyDistribucion(hoy),
    getProblemasPorTipo(),
    getCargaTecnico(hoy),
    getSucursalFallas(5),
    getTiempoEnSitio(),
    getReagendas(5),
  ]);

  // Los días sin visitas programadas no entran al gráfico: no se trabajó, así
  // que una barra en 0 solo ensuciaría la lectura del cumplimiento.
  const diasConTrabajo = dias.filter((d) => d.programadas > 0);

  return {
    rango,
    hoy,
    kpis: {
      programadas,
      cerradas,
      pctCumpl,
      reagendas,
      tecnicosHoy,
      problemasAbiertosTotal,
    },
    estadoHoy: estadoHoy.map((e) => ({
      estado: e.estado,
      label: ESTADO_VISITA_LABEL[e.estado],
      color: ESTADO_VISITA_COLOR[e.estado],
      n: e.n,
      pct: e.pct,
    })),
    totalHoy: deHoy.length,
    cumplimiento: {
      pct: pctCumpl,
      meta: 92,
      detalle: `${cerradas} de ${programadas} visitas cerradas dentro de la fecha programada.`,
      rangoTexto:
        rango === "Hoy"
          ? `Hoy · ${hoy}`
          : rango === "Semana"
            ? "Semana en curso"
            : new Date(`${hoy}T00:00:00`).toLocaleDateString("es-CL", { month: "long", year: "numeric" }),
      dias: diasConTrabajo.map((d) => ({
        fecha: d.fecha,
        pct: d.pct,
        pctTxt: `${d.pct}%`,
        programadas: d.programadas,
        cerradas: d.cerradas,
        esHoy: d.fecha === hoy,
        // La barra mide el cumplimiento del día, no cuántas visitas hubo.
        h: Math.max(2, d.pct),
        label: new Date(`${d.fecha}T00:00:00`)
          .toLocaleDateString("es-CL", { weekday: "short", day: "2-digit" })
          .replace(".", ""),
      })),
    },
    problemasTipo,
    carga: carga.map((c) => ({
      ...c,
      pct: c.programadas ? Math.round((100 * c.realizadas) / c.programadas) : 0,
    })),
    sucursalesFallas,
    tiempo,
    reagendasLista,
  };
}

export type PanelData = Awaited<ReturnType<typeof buildPanelData>>;

/** El rango se usa para la ventana de fechas del gráfico. */
export { rangoFechas };
