import { getVisitasCompletas, getTodosLosProblemas, reagendamientosPorVisita, ejecuciones } from "./visitas";
import { getCatalogoProblemaByCodigo, getCatalogoMotivoByCodigo } from "./catalogos";
import type { EstadoVisita, Visita } from "@/lib/types";

// Espejo en memoria de las vistas dmc.v_cumplimiento_dia / v_problema_abierto /
// v_sucursal_fallas / v_visita_realizada de sql/dmc_contingencia_sqlserver.sql.
// Cuando la conexión real (lib/db) quede habilitada, estas funciones se
// reemplazan por SELECTs a esas vistas sin tocar los componentes que las usan.

export const HOY = "2026-08-13"; // "hoy" del prototipo — ver sql/dmc_contingencia_sqlserver.sql

function inicioSemana(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`);
  const dow = d.getDay() === 0 ? 7 : d.getDay(); // lunes=1 … domingo=7
  d.setDate(d.getDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

export function getVisitasSemana(referencia: string = HOY): Visita[] {
  const desde = inicioSemana(referencia);
  const hasta = new Date(`${desde}T00:00:00`);
  hasta.setDate(hasta.getDate() + 6);
  const hastaStr = hasta.toISOString().slice(0, 10);
  return getVisitasCompletas().filter((v) => v.fechaProgramada >= desde && v.fechaProgramada <= hastaStr);
}

export function getVisitasHoy(referencia: string = HOY): Visita[] {
  return getVisitasCompletas().filter((v) => v.fechaProgramada === referencia);
}

export function getVisitasMes(referencia: string = HOY): Visita[] {
  const mes = referencia.slice(0, 7);
  return getVisitasCompletas().filter((v) => v.fechaProgramada.startsWith(mes));
}

export function getVisitasRango(rango: "Hoy" | "Semana" | "Mes", referencia: string = HOY): Visita[] {
  if (rango === "Hoy") return getVisitasHoy(referencia);
  if (rango === "Semana") return getVisitasSemana(referencia);
  return getVisitasMes(referencia);
}

export function getCumplimientoDia(fecha: string): { programadas: number; cerradas: number; pct: number } {
  const del = getVisitasCompletas().filter((v) => v.fechaProgramada === fecha);
  const programadas = del.length;
  const cerradas = del.filter((v) => v.estado === "COMPLETADA").length;
  return { programadas, cerradas, pct: programadas ? Math.round((100 * cerradas) / programadas) : 0 };
}

export function getCumplimientoRango(desde: string, hasta: string) {
  const fechas = [...new Set(getVisitasCompletas().map((v) => v.fechaProgramada))]
    .filter((f) => f >= desde && f <= hasta)
    .sort();
  return fechas.map((fecha) => ({ fecha, ...getCumplimientoDia(fecha) }));
}

export function getEstadoHoyDistribucion(referencia: string = HOY) {
  const del = getVisitasHoy(referencia);
  const total = del.length;
  const estados: EstadoVisita[] = ["COMPLETADA", "EN_CURSO", "PROGRAMADA", "PENDIENTE", "REAGENDADA", "CANCELADA"];
  return estados
    .map((estado) => {
      const n = del.filter((v) => v.estado === estado).length;
      return { estado, n, pct: total ? Math.round((100 * n) / total) : 0 };
    })
    .filter((e) => e.n > 0);
}

export function getProblemasAbiertos() {
  return getTodosLosProblemas()
    .filter((p) => p.estado !== "RESUELTO")
    .map((p) => {
      const visita = getVisitasCompletas().find((v) => v.id === p.visitaId)!;
      return { problema: p, visita };
    });
}

/** Visita ya agendada para resolver un problema, si existe. */
export interface AgendaProblema {
  folio: string;
  fecha: string;
  tecnico: string;
}

export function getProblemasPorSucursal() {
  const todas = getVisitasCompletas();
  const porSucursal = new Map<
    number,
    {
      sucursalId: number;
      nombre: string;
      cliente: string;
      clienteId: number;
      comuna: string;
      items: {
        problema: ReturnType<typeof getTodosLosProblemas>[number];
        visita: Visita;
        agenda: AgendaProblema | null;
      }[];
    }
  >();
  for (const p of getTodosLosProblemas()) {
    const visita = todas.find((v) => v.id === p.visitaId)!;
    const s = visita.sucursal!;
    const agendada = todas.find((v) => v.problemaOrigenId === p.id);
    const acc = porSucursal.get(s.id) ?? {
      sucursalId: s.id,
      nombre: s.nombre,
      cliente: visita.cliente?.nombreFantasia ?? "",
      clienteId: visita.clienteId,
      comuna: s.comuna,
      items: [],
    };
    acc.items.push({
      problema: p,
      visita,
      agenda: agendada
        ? {
            folio: agendada.folio,
            fecha: agendada.fechaProgramada,
            tecnico: agendada.tecnico?.nombreCompleto ?? "—",
          }
        : null,
    });
    porSucursal.set(s.id, acc);
  }
  return [...porSucursal.values()]
    .map((s) => ({
      ...s,
      total: s.items.length,
      abiertos: s.items.filter((i) => i.problema.estado !== "RESUELTO").length,
    }))
    .sort((a, b) => b.abiertos - a.abiertos);
}

export function getReagendas() {
  return Object.values(reagendamientosPorVisita)
    .flat()
    .map((r) => ({
      reagendamiento: r,
      visita: getVisitasCompletas().find((v) => v.id === r.visitaId)!,
    }));
}

export function getSucursalFallas() {
  const porSucursal = new Map<number, { sucursalId: number; total: number; sinCerrar: number }>();
  for (const p of getTodosLosProblemas()) {
    const visita = getVisitasCompletas().find((v) => v.id === p.visitaId)!;
    const acc = porSucursal.get(visita.sucursalId) ?? { sucursalId: visita.sucursalId, total: 0, sinCerrar: 0 };
    acc.total += 1;
    if (p.estado !== "RESUELTO") acc.sinCerrar += 1;
    porSucursal.set(visita.sucursalId, acc);
  }
  return [...porSucursal.values()].map((s) => ({
    ...s,
    sucursal: getVisitasCompletas().find((v) => v.sucursalId === s.sucursalId)!.sucursal!,
  }));
}

export function getProblemasPorTipo() {
  const abiertos = getTodosLosProblemas().filter((p) => p.estado !== "RESUELTO");
  const porTipo = new Map<string, number>();
  for (const p of abiertos) {
    porTipo.set(p.tipoCodigo, (porTipo.get(p.tipoCodigo) ?? 0) + 1);
  }
  const total = abiertos.length;
  return [...porTipo.entries()]
    .map(([codigo, n]) => ({
      codigo,
      nombre: getCatalogoProblemaByCodigo(codigo)?.nombre ?? codigo,
      n,
      pct: total ? Math.round((100 * n) / total) : 0,
    }))
    .sort((a, b) => b.n - a.n);
}

export function getTiempoEnSitio() {
  const cerradas = Object.values(ejecuciones).filter((e) => e.horaTermino);
  const duraciones = cerradas.map((e) => ({
    motivo: e.motivoRealCodigo,
    min: Math.round((new Date(e.horaTermino!).getTime() - new Date(e.horaInicio).getTime()) / 60000),
  }));
  const prom = duraciones.length
    ? Math.round(duraciones.reduce((acc, d) => acc + d.min, 0) / duraciones.length)
    : 0;
  const porMotivo = new Map<string, { total: number; n: number }>();
  for (const d of duraciones) {
    if (!d.motivo) continue;
    const acc = porMotivo.get(d.motivo) ?? { total: 0, n: 0 };
    acc.total += d.min;
    acc.n += 1;
    porMotivo.set(d.motivo, acc);
  }
  const max = Math.max(1, ...[...porMotivo.values()].map((v) => Math.round(v.total / v.n)));
  const porMotivoLista = [...porMotivo.entries()]
    .map(([codigo, v]) => ({
      label: getCatalogoMotivoByCodigo(codigo)?.nombre ?? codigo,
      min: Math.round(v.total / v.n),
      pct: Math.round((100 * Math.round(v.total / v.n)) / max),
    }))
    .sort((a, b) => b.min - a.min);
  return { prom, porMotivo: porMotivoLista };
}

export function getCargaTecnico(referencia: string = HOY) {
  const del = getVisitasCompletas().filter((v) => v.fechaProgramada === referencia);
  const porTecnico = new Map<number, { tecnicoId: number; programadas: number; realizadas: number; noRealizadas: number }>();
  for (const v of del) {
    const acc = porTecnico.get(v.tecnicoId) ?? { tecnicoId: v.tecnicoId, programadas: 0, realizadas: 0, noRealizadas: 0 };
    acc.programadas += 1;
    if (v.estado === "COMPLETADA") acc.realizadas += 1;
    if (["REAGENDADA", "PENDIENTE", "CANCELADA"].includes(v.estado)) acc.noRealizadas += 1;
    porTecnico.set(v.tecnicoId, acc);
  }
  return [...porTecnico.values()];
}
