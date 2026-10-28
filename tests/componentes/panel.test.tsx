import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// El panel se pinta con lo que arma buildPanelData: se usa la función real con
// las consultas simuladas, así el componente y el cálculo se prueban juntos.
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

import PanelDashboard from "@/components/admin/PanelDashboard";
import { buildPanelData, type PanelData, type Rango } from "@/lib/ui/panel-data";

const HOY = "2026-10-28";

async function datos(): Promise<Record<Rango, PanelData>> {
  return {
    Hoy: await buildPanelData("Hoy", HOY),
    Semana: await buildPanelData("Semana", HOY),
    Mes: await buildPanelData("Mes", HOY),
  };
}

const v = (estado: string, tecnicoId: number) => ({ estado, tecnicoId });

beforeEach(() => {
  vi.resetAllMocks();
  q.contarProblemasAbiertos.mockResolvedValue(7);
  q.getEstadoHoyDistribucion.mockResolvedValue([
    { estado: "COMPLETADA", n: 3, pct: 75 },
    { estado: "EN_CURSO", n: 1, pct: 25 },
  ]);
  q.getProblemasPorTipo.mockResolvedValue([{ codigo: "OTRO", nombre: "Otro problema", n: 4, pct: 100 }]);
  q.getCargaTecnico.mockResolvedValue([{ nombre: "Ana Pérez", tecnicoId: 1, programadas: 4, realizadas: 3 }]);
  q.getSucursalFallas.mockResolvedValue([]);
  q.getTiempoEnSitio.mockResolvedValue({ prom: 42, porMotivo: [{ label: "Calibración", min: 55, pct: 100 }] });
  q.getReagendas.mockResolvedValue([]);
  q.getCumplimientoRango.mockResolvedValue([{ fecha: HOY, programadas: 4, cerradas: 3, pct: 75 }]);
  q.getVisitasRango.mockImplementation(async (rango: string) =>
    rango === "Hoy"
      ? [v("COMPLETADA", 1), v("COMPLETADA", 1), v("COMPLETADA", 2), v("EN_CURSO", 3)]
      : rango === "Semana"
        ? Array.from({ length: 10 }, (_, i) => v(i < 6 ? "COMPLETADA" : "PROGRAMADA", 1 + (i % 3)))
        : Array.from({ length: 20 }, (_, i) => v(i < 5 ? "COMPLETADA" : "REAGENDADA", 1 + (i % 4)))
  );
});

describe("panel de operación", () => {
  it("parte en «Hoy» con los KPI del día", async () => {
    render(<PanelDashboard data={await datos()} />);
    expect(screen.getByRole("heading", { name: "Panel de operación" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Hoy" })).toBeChecked();
    expect(screen.getByText("Visitas · hoy")).toBeInTheDocument();
    expect(screen.getByText("Cumplimiento · hoy")).toBeInTheDocument();
    expect(screen.getAllByText("75%").length).toBeGreaterThan(0);
    expect(screen.getByText("3 de 4 cerradas a tiempo")).toBeInTheDocument();
    expect(screen.getByText("3 técnicos en terreno")).toBeInTheDocument();
  });

  it("cambiar de rango recalcula todo con los datos de ese rango", async () => {
    const u = userEvent.setup();
    render(<PanelDashboard data={await datos()} />);
    await u.click(screen.getByRole("radio", { name: "Semana" }));
    expect(screen.getByText("Visitas · semana")).toBeInTheDocument();
    expect(screen.getAllByText("60%").length).toBeGreaterThan(0);
    expect(screen.getByText("6 de 10 cerradas a tiempo")).toBeInTheDocument();
    expect(screen.getByText("4 sin cerrar a tiempo")).toBeInTheDocument();

    await u.click(screen.getByRole("radio", { name: "Mes" }));
    expect(screen.getByText("Visitas · mes")).toBeInTheDocument();
    expect(screen.getAllByText("25%").length).toBeGreaterThan(0);
    expect(screen.getByText("Reagendas · mes")).toBeInTheDocument();
  });

  it("los KPI enlazan a la vista filtrada correspondiente", async () => {
    render(<PanelDashboard data={await datos()} />);
    expect(screen.getByRole("link", { name: /Ver visitas/ })).toHaveAttribute("href", "/admin/visitas");
    expect(screen.getByRole("link", { name: /Ver completadas/ })).toHaveAttribute("href", "/admin/visitas?estado=COMPLETADA");
    expect(screen.getByRole("link", { name: /Ver problemas/ })).toHaveAttribute("href", "/admin/problemas");
    expect(screen.getByRole("link", { name: /Ver reagendas/ })).toHaveAttribute("href", "/admin/reagendas");
  });

  it("muestra los problemas abiertos en total y por tipo", async () => {
    render(<PanelDashboard data={await datos()} />);
    expect(screen.getByText("7 abiertos")).toBeInTheDocument();
    expect(screen.getByText("Otro problema")).toBeInTheDocument();
  });

  it("muestra el tiempo en sitio promedio y por motivo", async () => {
    render(<PanelDashboard data={await datos()} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Calibración")).toBeInTheDocument();
    expect(screen.getByText("55 min")).toBeInTheDocument();
  });

  it("sin problemas registrados lo dice", async () => {
    q.getProblemasPorTipo.mockResolvedValue([]);
    render(<PanelDashboard data={await datos()} />);
    expect(screen.getByText("Sin problemas registrados en este período.")).toBeInTheDocument();
  });

  it("la distribución de estados enlaza al listado filtrado por cada estado", async () => {
    render(<PanelDashboard data={await datos()} />);
    const enlace = screen.getByRole("link", { name: /Completada/ });
    expect(enlace).toHaveAttribute("href", "/admin/visitas?estado=COMPLETADA");
    expect(within(enlace).getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("4 visitas")).toBeInTheDocument();
  });

  it("la carga por técnico muestra programadas y realizadas con su avance", async () => {
    render(<PanelDashboard data={await datos()} />);
    const fila = screen.getByText("Ana Pérez").closest("tr")!;
    expect(within(fila).getByText("4")).toBeInTheDocument();
    expect(within(fila).getByText("3")).toBeInTheDocument();
  });

  it("con cero visitas no se rompe (todo en cero)", async () => {
    q.getVisitasRango.mockResolvedValue([]);
    q.getEstadoHoyDistribucion.mockResolvedValue([]);
    q.getCumplimientoRango.mockResolvedValue([]);
    q.getCargaTecnico.mockResolvedValue([]);
    render(<PanelDashboard data={await datos()} />);
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
    expect(screen.getByText("0 visitas")).toBeInTheDocument();
  });
});
