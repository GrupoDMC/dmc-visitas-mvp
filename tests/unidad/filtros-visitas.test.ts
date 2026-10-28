import { describe, expect, it } from "vitest";
import {
  acotarFiltros,
  ELIMINADAS,
  leerFiltrosVisitas,
  patronBusqueda,
  SIN_FILTROS,
  urlFiltrosVisitas,
  type FiltrosVisitas,
  type LugarConVisitas,
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
      regiones: ["Metropolitana", "Ñuble"],
      mallId: "3",
      clienteIds: ["7", "8"],
      marcaIds: ["20", "21"],
      sucursalIds: ["12", "15"],
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
    });
    expect(f.estados).toEqual([]);
    expect(f.desde).toBe("");
    expect(f.clienteIds).toEqual([]);
    expect(f.tecnicoId).toBe("");
    expect(f.pagina).toBe(1);
    expect(f.limite).toBe(50);
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

  it("el filtro por semana ya no existe: la URL lo ignora y no lo escribe", () => {
    expect(leer({ semana: "2026-10-26" })).toEqual(SIN_FILTROS);
  });

  it("la marca y la tienda solo cuentan con cliente, y el tipo de falla solo sin él", () => {
    expect(leer({ tienda: "5" }).sucursalIds).toEqual([]);
    expect(leer({ marca: "9" }).marcaIds).toEqual([]);
    expect(leer({ cliente: "1", tienda: "5" }).sucursalIds).toEqual(["5"]);
    expect(leer({ cliente: "1", marca: "9" }).marcaIds).toEqual(["9"]);
    expect(urlFiltrosVisitas({ ...SIN_FILTROS, marcaIds: ["9"] })).toBe("/admin/visitas");
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

// Dos regiones; en la Metropolitana dos malls. El cliente 1 tiene dos marcas
// (una con tiendas en ambos malls) y el cliente 2 está solo en Valparaíso.
const L = (
  region: string,
  mallId: number | null,
  clienteId: number,
  marcaId: number,
  sucursalId: number
): LugarConVisitas => ({
  region,
  mallId,
  mall: mallId === null ? null : `Mall ${mallId}`,
  clienteId,
  cliente: `Cliente ${clienteId}`,
  marcaId,
  marca: `Marca ${marcaId}`,
  sucursalId,
  sucursal: `Tienda ${sucursalId}`,
});
const LUGARES = [
  L("Metropolitana", 1, 1, 10, 100),
  L("Metropolitana", 2, 1, 10, 101),
  L("Metropolitana", 2, 1, 11, 102),
  L("Metropolitana", null, 3, 30, 300),
  L("Valparaíso", 5, 2, 20, 200),
  L("Valparaíso", 5, 1, 11, 103),
];
const acotar = (extra: Partial<FiltrosVisitas>) => acotarFiltros(LUGARES, { ...SIN_FILTROS, ...extra });
const ids = (lista: [number, string][]) => lista.map(([i]) => i);

describe("filtros en cascada (región → mall → cliente → marca → sucursal)", () => {
  it("sin nada elegido se ofrece todo, y la región va de norte a sur", () => {
    const { opciones, filtros } = acotar({});
    expect(opciones.regiones).toEqual(["Valparaíso", "Metropolitana"]);
    expect(ids(opciones.malls)).toEqual([1, 2, 5]);
    expect(ids(opciones.clientes)).toEqual([1, 2, 3]);
    // Marca y sucursal recién aparecen con un cliente elegido.
    expect(opciones.marcas).toEqual([]);
    expect(opciones.tiendas).toEqual([]);
    expect(filtros).toEqual(SIN_FILTROS);
  });

  it("elegir zona deja solo los malls de esa zona", () => {
    expect(ids(acotar({ regiones: ["Valparaíso"] }).opciones.malls)).toEqual([5]);
    expect(ids(acotar({ regiones: ["Metropolitana"] }).opciones.malls)).toEqual([1, 2]);
    // Varias zonas a la vez suman sus malls.
    expect(ids(acotar({ regiones: ["Metropolitana", "Valparaíso"] }).opciones.malls)).toEqual([1, 2, 5]);
  });

  it("la zona y el mall acotan los clientes", () => {
    expect(ids(acotar({ regiones: ["Valparaíso"] }).opciones.clientes)).toEqual([1, 2]);
    expect(ids(acotar({ mallId: "1" }).opciones.clientes)).toEqual([1]);
  });

  it("un mall que ya no está en la zona elegida se descarta", () => {
    const { filtros } = acotar({ regiones: ["Valparaíso"], mallId: "1" });
    expect(filtros.mallId).toBe("");
    expect(acotar({ regiones: ["Metropolitana"], mallId: "1" }).filtros.mallId).toBe("1");
  });

  it("y la limpieza baja por la cadena: sin ese mall el cliente que solo estaba ahí también sale", () => {
    const { filtros } = acotar({ regiones: ["Valparaíso"], clienteIds: ["3"], sucursalIds: ["300"] });
    expect(filtros.clienteIds).toEqual([]);
    expect(filtros.sucursalIds).toEqual([]);
  });

  it("elegir cliente ofrece solo sus marcas, y las marcas acotan las sucursales", () => {
    const uno = acotar({ clienteIds: ["1"] });
    expect(ids(uno.opciones.marcas)).toEqual([10, 11]);
    expect(ids(uno.opciones.tiendas)).toEqual([100, 101, 102, 103]);
    const conMarca = acotar({ clienteIds: ["1"], marcaIds: ["11"] });
    expect(ids(conMarca.opciones.tiendas)).toEqual([102, 103]);
    // Varios clientes suman sus marcas.
    expect(ids(acotar({ clienteIds: ["1", "2"] }).opciones.marcas)).toEqual([10, 11, 20]);
  });

  it("la marca también respeta zona y mall", () => {
    const { opciones } = acotar({ mallId: "1", clienteIds: ["1"] });
    expect(ids(opciones.marcas)).toEqual([10]);
    expect(ids(opciones.tiendas)).toEqual([100]);
  });

  it("al cambiar el cliente se descartan la marca y la sucursal que eran de otro", () => {
    const { filtros } = acotar({ clienteIds: ["2"], marcaIds: ["10", "20"], sucursalIds: ["100", "200"] });
    expect(filtros.marcaIds).toEqual(["20"]);
    expect(filtros.sucursalIds).toEqual(["200"]);
  });

  it("al elegir marca se descarta la sucursal de otra marca y se conserva la que cabe", () => {
    const { filtros } = acotar({ clienteIds: ["1"], marcaIds: ["11"], sucursalIds: ["100", "102"] });
    expect(filtros.sucursalIds).toEqual(["102"]);
  });

  it("lo que sigue cabiendo no se toca, ni los filtros que no son de la cadena", () => {
    const f = { regiones: ["Metropolitana"], mallId: "2", clienteIds: ["1"], marcaIds: ["10"], sucursalIds: ["101"], estados: ["PENDIENTE"], desde: "2026-01-01" };
    expect(acotar(f).filtros).toEqual({ ...SIN_FILTROS, ...f });
  });
});
