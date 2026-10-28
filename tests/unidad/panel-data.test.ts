import { beforeEach, describe, expect, it, vi } from "vitest";

// Datos del panel con la capa de consultas simulada: solo se prueba el cálculo
// de KPIs y gráficos, no el SQL.
const q = vi.hoisted(() => ({
  contarProblemasAbiertos: vi.fn(),
  getCargaTecnico: vi.fn(),
  getCumplimientoRango: vi.fn(),
  getEstadoHoyDistribucion: vi.fn(),
  getProblemasPorTipo: vi.fn(),
  getReagendas: vi.fn(),
  getSucursalFallas: vi.fn(),
  getTiempoEnSitio: vi.fn(),
  getVisitasRango: vi.fn(),
  rangoFechas: vi.fn(),
}));
vi.mock("@/lib/data/queries", () => q);

import { buildPanelData } from "@/lib/ui/panel-data";

const visita = (estado: string, tecnicoId: number) => ({ estado, tecnicoId });

beforeEach(() => {
  vi.clearAllMocks();
  q.contarProblemasAbiertos.mockResolvedValue(7);
  q.getEstadoHoyDistribucion.mockResolvedValue([{ estado: "COMPLETADA", n: 3, pct: 75 }]);
  q.getProblemasPorTipo.mockResolvedValue([]);
  q.getCargaTecnico.mockResolvedValue([
    { tecnico: "Ana", programadas: 4, realizadas: 3 },
    { tecnico: "Beto", programadas: 0, realizadas: 0 },
  ]);
  q.getSucursalFallas.mockResolvedValue([]);
  q.getTiempoEnSitio.mockResolvedValue([]);
  q.getReagendas.mockResolvedValue([]);
  q.getCumplimientoRango.mockResolvedValue([
    { fecha: "2026-10-27", programadas: 0, cerradas: 0, pct: 0 },
    { fecha: "2026-10-28", programadas: 4, cerradas: 3, pct: 75 },
    { fecha: "2026-10-26", programadas: 2, cerradas: 0, pct: 0 },
  ]);
});

describe("buildPanelData", () => {
  it("calcula los KPIs del rango", async () => {
    q.getVisitasRango.mockResolvedValue([
      visita("COMPLETADA", 1),
      visita("COMPLETADA", 1),
      visita("REAGENDADA", 2),
      visita("PENDIENTE", 3),
    ]);
    const d = await buildPanelData("Hoy", "2026-10-28");

    expect(d.kpis).toEqual({ programadas: 4, cerradas: 2, pctCumpl: 50, reagendas: 2, tecnicosHoy: 3, problemasAbiertosTotal: 7 });
    expect(d.cumplimiento.detalle).toBe("2 de 4 visitas cerradas dentro de la fecha programada.");
    expect(d.cumplimiento.rangoTexto).toBe("Hoy · 2026-10-28");
    expect(d.cumplimiento.meta).toBe(92);
    // En «Hoy» no se pide dos veces el mismo rango.
    expect(q.getVisitasRango).toHaveBeenCalledTimes(1);
  });

  it("sin visitas el cumplimiento es 0 y no divide por cero", async () => {
    q.getVisitasRango.mockResolvedValue([]);
    const d = await buildPanelData("Hoy", "2026-10-28");
    expect(d.kpis.pctCumpl).toBe(0);
    expect(d.totalHoy).toBe(0);
  });

  it("en Semana/Mes los técnicos de hoy salen de las visitas de hoy, no del rango", async () => {
    q.getVisitasRango.mockImplementation(async (rango: string) =>
      rango === "Hoy" ? [visita("EN_CURSO", 9)] : [visita("COMPLETADA", 1), visita("COMPLETADA", 2)]
    );
    const d = await buildPanelData("Semana", "2026-10-28");
    expect(d.kpis.programadas).toBe(2);
    expect(d.kpis.tecnicosHoy).toBe(1);
    expect(d.totalHoy).toBe(1);
    expect(d.cumplimiento.rangoTexto).toBe("Semana en curso");
    expect(q.getCumplimientoRango).toHaveBeenCalledWith("2026-10-26", "2026-10-28");
  });

  it("el rango Mes parte del día 1", async () => {
    q.getVisitasRango.mockResolvedValue([]);
    await buildPanelData("Mes", "2026-10-28");
    expect(q.getCumplimientoRango).toHaveBeenCalledWith("2026-10-01", "2026-10-28");
  });

  it("el gráfico omite los días sin visitas y marca el de hoy; la barra mide al menos 2", async () => {
    q.getVisitasRango.mockResolvedValue([]);
    const d = await buildPanelData("Semana", "2026-10-28");
    expect(d.cumplimiento.dias.map((x) => x.fecha)).toEqual(["2026-10-28", "2026-10-26"]);
    expect(d.cumplimiento.dias[0]).toMatchObject({ esHoy: true, pctTxt: "75%", h: 75 });
    expect(d.cumplimiento.dias[1]).toMatchObject({ esHoy: false, pctTxt: "0%", h: 2 });
  });

  it("la carga por técnico trae su porcentaje de avance", async () => {
    q.getVisitasRango.mockResolvedValue([]);
    const d = await buildPanelData("Hoy", "2026-10-28");
    expect(d.carga.map((c) => c.pct)).toEqual([75, 0]);
  });

  it("el estado de hoy trae etiqueta y color", async () => {
    q.getVisitasRango.mockResolvedValue([]);
    const d = await buildPanelData("Hoy", "2026-10-28");
    expect(d.estadoHoy[0]).toMatchObject({ estado: "COMPLETADA", label: "Completada", n: 3, pct: 75 });
    expect(d.estadoHoy[0].color).toMatch(/^var\(--color-/);
  });
});
