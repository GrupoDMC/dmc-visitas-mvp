import { describe, expect, it } from "vitest";
import {
  ELIMINADAS,
  leerFiltrosVisitas,
  lunesDe,
  rangoSemana,
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
      estados: ["PENDIENTE", "REAGENDADA"],
      desde: "2026-01-01",
      hasta: "2026-01-31",
      semana: "2026-01-26",
      clienteIds: ["7", "8"],
      sucursalIds: ["12", "15"],
      regiones: ["Metropolitana", "Ñuble"],
      mallId: "3",
      tecnicoId: "4",
      q: "jumbo",
      limite: 15,
      pagina: 3,
    };
    const url = urlFiltrosVisitas(f);
    const params: Record<string, string[]> = {};
    new URL(url, "http://x").searchParams.forEach((v, k) => (params[k] ??= []).push(v));
    expect(leerFiltrosVisitas(params, { verEliminadas: false })).toEqual(f);
  });

  it("un día suelto de los enlaces del panel es un rango de ese día", () => {
    const f = leer({ fecha: "2026-03-04" });
    expect(f.desde).toBe("2026-03-04");
    expect(f.hasta).toBe("2026-03-04");
  });

  it("descarta lo que no tiene forma válida", () => {
    const f = leer({
      estado: "INVENTADO",
      desde: "ayer",
      cliente: "1 OR 1=1",
      tecnico: "-2",
      pagina: "x",
      limite: "9999",
      semana: "pronto",
    });
    expect(f.estados).toEqual([]);
    expect(f.desde).toBe("");
    expect(f.clienteIds).toEqual([]);
    expect(f.tecnicoId).toBe("");
    expect(f.pagina).toBe(1);
    expect(f.limite).toBe(50);
    expect(f.semana).toBe("");
  });

  it("acepta varios valores repetidos y solo los válidos", () => {
    const f = leerFiltrosVisitas(
      { estado: ["PENDIENTE", "X", "PENDIENTE", "CANCELADA"], cliente: ["1", "2", "no"], region: ["Maule", "Maule"] },
      { verEliminadas: false }
    );
    expect(f.estados).toEqual(["PENDIENTE", "CANCELADA"]);
    expect(f.clienteIds).toEqual(["1", "2"]);
    expect(f.regiones).toEqual(["Maule"]);
  });

  it("el límite es uno de los permitidos", () => {
    expect(leer({ limite: "10" }).limite).toBe(10);
    expect(leer({ limite: "25" }).limite).toBe(25);
    expect(leer({ limite: "30" }).limite).toBe(50);
  });

  it("la semana va de lunes a domingo", () => {
    expect(lunesDe("2026-10-28")).toBe("2026-10-26"); // miércoles
    expect(lunesDe("2026-11-01")).toBe("2026-10-26"); // domingo
    expect(lunesDe("2026-10-26")).toBe("2026-10-26");
    expect(lunesDe("basura")).toBe("");
    expect(rangoSemana("2026-10-26")).toEqual({ desde: "2026-10-26", hasta: "2026-11-01" });
    expect(leer({ semana: "2026-10-30" }).semana).toBe("2026-10-26");
  });

  it("la tienda solo cuenta con cliente, y el tipo de falla solo sin él", () => {
    expect(leer({ tienda: "5" }).sucursalIds).toEqual([]);
    expect(leer({ cliente: "1", tienda: "5" }).sucursalIds).toEqual(["5"]);
    expect(leer({ cliente: "1", tipo: "CABLE" }).tipo).toBe("");
    expect(leer({ tipo: "CABLE" }).tipo).toBe("CABLE");
  });

  it("las eliminadas solo se abren para quien puede verlas", () => {
    expect(leer({ estado: ELIMINADAS }).estados).toEqual([]);
    expect(leer({ estado: ELIMINADAS }, true).estados).toEqual([ELIMINADAS]);
    // Se miran solas: no se mezclan con otros estados.
    expect(leerFiltrosVisitas({ estado: [ELIMINADAS, "PENDIENTE"] }, { verEliminadas: true }).estados).toEqual([ELIMINADAS]);
  });

  it("el texto se busca literal: los comodines de LIKE van escapados", () => {
    expect(patronBusqueda(" 50% ")).toBe("%50[%]%");
    expect(patronBusqueda("a_b[c")).toBe("%a[_]b[[]c%");
  });
});
