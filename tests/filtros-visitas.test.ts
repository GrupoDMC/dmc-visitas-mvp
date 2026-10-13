import { describe, expect, it } from "vitest";
import {
  ELIMINADAS,
  leerFiltrosVisitas,
  patronBusqueda,
  SIN_FILTROS,
  urlFiltrosVisitas,
} from "@/lib/ui/filtros-visitas";

const leer = (p: Record<string, string>, verEliminadas = false) => leerFiltrosVisitas(p, { verEliminadas });

describe("filtros de la lista de visitas", () => {
  it("sin parámetros quedan los de por defecto", () => {
    expect(leer({})).toEqual(SIN_FILTROS);
    expect(urlFiltrosVisitas(SIN_FILTROS)).toBe("/admin/visitas");
  });

  it("ida y vuelta por la URL", () => {
    const f = {
      ...SIN_FILTROS,
      estado: "PENDIENTE",
      desde: "2026-01-01",
      hasta: "2026-01-31",
      clienteId: "7",
      sucursalId: "12",
      mallId: "3",
      tecnicoId: "4",
      q: "jumbo",
      pagina: 3,
    };
    const url = urlFiltrosVisitas(f);
    const params = Object.fromEntries(new URL(url, "http://x").searchParams);
    expect(leer(params)).toEqual(f);
  });

  it("un día suelto de los enlaces del panel es un rango de ese día", () => {
    const f = leer({ fecha: "2026-03-04" });
    expect(f.desde).toBe("2026-03-04");
    expect(f.hasta).toBe("2026-03-04");
  });

  it("descarta lo que no tiene forma válida", () => {
    const f = leer({ estado: "INVENTADO", desde: "ayer", cliente: "1 OR 1=1", tecnico: "-2", pagina: "x" });
    expect(f.estado).toBe("TODAS");
    expect(f.desde).toBe("");
    expect(f.clienteId).toBe("");
    expect(f.tecnicoId).toBe("");
    expect(f.pagina).toBe(1);
  });

  it("la tienda solo cuenta con cliente, y el tipo de falla solo sin él", () => {
    expect(leer({ tienda: "5" }).sucursalId).toBe("");
    expect(leer({ cliente: "1", tienda: "5" }).sucursalId).toBe("5");
    expect(leer({ cliente: "1", tipo: "CABLE" }).tipo).toBe("");
    expect(leer({ tipo: "CABLE" }).tipo).toBe("CABLE");
  });

  it("las eliminadas solo se abren para quien puede verlas", () => {
    expect(leer({ estado: ELIMINADAS }).estado).toBe("TODAS");
    expect(leer({ estado: ELIMINADAS }, true).estado).toBe(ELIMINADAS);
  });

  it("el texto se busca literal: los comodines de LIKE van escapados", () => {
    expect(patronBusqueda(" 50% ")).toBe("%50[%]%");
    expect(patronBusqueda("a_b[c")).toBe("%a[_]b[[]c%");
  });
});
