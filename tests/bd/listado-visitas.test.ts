import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consulta } from "@/lib/data/sql";
import { buscarVisitas, opcionesFiltroVisitas } from "@/lib/data/visitas-lista";
import { ELIMINADAS, SIN_FILTROS, lunesDe, type FiltrosVisitas } from "@/lib/ui/filtros-visitas";
import { hoyISO, sumarDias } from "@/lib/ui/fecha";
import { hayBd, insertarVisita, limpiarDatos, sembrarMundo, uno, type Mundo } from "./_ayuda";

// Los filtros del listado del panel ejecutados contra SQL Server de verdad: el
// WHERE se arma con SQL dinámico parametrizado y solo la base confirma que
// filtra lo que dice (collation, rangos de fecha, EXISTS, paginación).
describe.skipIf(!hayBd)("BD · listado de visitas con filtros", () => {
  let m: Mundo;
  let otroClienteId: number;
  let otraSucursalId: number;
  let mallId: number;
  const f = (extra: Partial<FiltrosVisitas>): FiltrosVisitas => ({ ...SIN_FILTROS, ...extra });
  const folios = async (extra: Partial<FiltrosVisitas>) => (await buscarVisitas(f(extra))).visitas.map((v) => v.folio);

  // Todas dentro del plazo (futuras) para que el vencimiento no las cancele.
  const D = (n: number) => sumarDias(hoyISO(), n);
  const porId: Record<string, string> = {};

  beforeAll(async () => {
    await limpiarDatos();
    m = await sembrarMundo();
    await consulta(`
      INSERT INTO dmc.cliente (rut, razon_social, nombre_fantasia) VALUES ('76.000.002-0', N'Dos SpA', N'Cliente Dos');
      INSERT INTO dmc.mall (nombre, direccion, comuna, region) VALUES (N'Mall Plaza', N'Av. 1', N'Valparaíso', N'Valparaíso');`);
    otroClienteId = Number((await uno<{ id: number }>(`SELECT id FROM dmc.cliente WHERE rut = '76.000.002-0'`))!.id);
    mallId = Number((await uno<{ id: number }>(`SELECT id FROM dmc.mall`))!.id);
    await consulta(`INSERT INTO dmc.marca (cliente_id, nombre) VALUES (${otroClienteId}, N'Marca Dos')`);
    const marca2 = Number((await uno<{ id: number }>(`SELECT id FROM dmc.marca WHERE cliente_id = ${otroClienteId}`))!.id);
    await consulta(`INSERT INTO dmc.sucursal (cliente_id, marca_id, mall_id, nombre, direccion, comuna, region)
                    VALUES (${otroClienteId}, ${marca2}, ${mallId}, N'Tienda Valpo', N'Av. 1', N'Valparaíso', N'Valparaíso')`);
    otraSucursalId = Number((await uno<{ id: number }>(`SELECT id FROM dmc.sucursal WHERE nombre = N'Tienda Valpo'`))!.id);

    const crear = async (clave: string, extra: Parameters<typeof insertarVisita>[1], cambios = "") => {
      const v = await insertarVisita(m, extra);
      if (cambios) await consulta(`UPDATE dmc.visita SET ${cambios} WHERE id = ${v.id}`);
      porId[clave] = v.folio;
      return v;
    };
    await crear("a", { fecha: D(1), estado: "PROGRAMADA" });
    await crear("b", { fecha: D(2), estado: "EN_CURSO" });
    await crear("c", { fecha: D(3), estado: "COMPLETADA" });
    await crear("d", { fecha: D(10), estado: "PROGRAMADA" }, `cliente_id = ${otroClienteId}, sucursal_id = ${otraSucursalId}`);
    await crear("e", { fecha: D(11), estado: "PENDIENTE" }, `cliente_id = ${otroClienteId}, sucursal_id = ${otraSucursalId}, tecnico_ayudante_id = ${m.tecnico2Id}`);
    const f2 = await crear("f", { fecha: D(12), estado: "PROGRAMADA" });
    await consulta(`UPDATE dmc.visita SET activo = 0 WHERE id = ${f2.id}`); // eliminada
    await consulta(`INSERT INTO dmc.problema (visita_id, tipo_codigo) SELECT id, 'ANTENA_NO_DETECTA' FROM dmc.visita WHERE folio = '${porId.c}'`);
  });
  afterAll(() => limpiarDatos());

  const sinEliminada = () => ["a", "b", "c", "d", "e"].map((k) => porId[k]);

  it("sin filtros trae las activas, de la más reciente a la más antigua, y no las eliminadas", async () => {
    const r = await buscarVisitas(f({}));
    expect(r.total).toBe(5);
    expect(r.visitas.map((v) => v.folio)).toEqual([porId.e, porId.d, porId.c, porId.b, porId.a]);
  });

  it("por estado: uno, varios, y sin coincidencias", async () => {
    expect(await folios({ estados: ["PROGRAMADA"] })).toEqual([porId.d, porId.a]);
    expect((await folios({ estados: ["COMPLETADA", "PENDIENTE"] })).sort()).toEqual([porId.c, porId.e].sort());
    expect(await folios({ estados: ["REAGENDADA"] })).toEqual([]);
  });

  it("«Eliminadas» muestra solo las eliminadas (y las demás no las ven)", async () => {
    expect(await folios({ estados: [ELIMINADAS] })).toEqual([porId.f]);
    expect(await folios({})).not.toContain(porId.f);
  });

  it("por cliente, y por sucursal solo si hay cliente elegido", async () => {
    expect(await folios({ clienteIds: [String(otroClienteId)] })).toEqual([porId.e, porId.d]);
    expect(await folios({ clienteIds: [String(m.clienteId)], sucursalIds: [String(m.sucursalId)] })).toEqual([porId.c, porId.b, porId.a]);
    // Una sucursal suelta, sin cliente, se ignora (tal como hace la pantalla).
    expect((await folios({ sucursalIds: [String(otraSucursalId)] })).length).toBe(5);
  });

  it("por varios clientes a la vez", async () => {
    expect((await folios({ clienteIds: [String(m.clienteId), String(otroClienteId)] })).length).toBe(5);
  });

  it("por región (la de hoy de la tienda) y por mall", async () => {
    expect(await folios({ regiones: ["Valparaíso"] })).toEqual([porId.e, porId.d]);
    expect(await folios({ regiones: ["Metropolitana"] })).toEqual([porId.c, porId.b, porId.a]);
    expect((await folios({ regiones: ["Metropolitana", "Valparaíso"] })).length).toBe(5);
    expect(await folios({ mallId: String(mallId) })).toEqual([porId.e, porId.d]);
  });

  it("por semana (lunes a domingo) y por rango de fechas", async () => {
    const lunes = lunesDe(D(2));
    const domingo = sumarDias(lunes, 6);
    const esperadas = ["a", "b", "c", "d", "e"].filter((k) => {
      const fecha = { a: D(1), b: D(2), c: D(3), d: D(10), e: D(11) }[k]!;
      return fecha >= lunes && fecha <= domingo;
    }).map((k) => porId[k]);
    expect((await folios({ semana: lunes })).sort()).toEqual(esperadas.sort());

    expect(await folios({ desde: D(10), hasta: D(11) })).toEqual([porId.e, porId.d]);
    expect(await folios({ desde: D(3) })).toEqual([porId.e, porId.d, porId.c]);
    expect(await folios({ hasta: D(1) })).toEqual([porId.a]);
  });

  it("por técnico incluye las visitas donde va de ayudante", async () => {
    expect((await folios({ tecnicoId: String(m.tecnico2Id) }))).toEqual([porId.e]);
    expect((await folios({ tecnicoId: String(m.tecnicoId) })).length).toBe(5);
  });

  it("por tipo de falla registrada", async () => {
    expect(await folios({ tipo: "ANTENA_NO_DETECTA" })).toEqual([porId.c]);
    expect(await folios({ tipo: "OTRO" })).toEqual([]);
  });

  it("la búsqueda de texto ignora mayúsculas y tildes y mira folio, cliente, sucursal, técnico y motivo", async () => {
    expect(await folios({ q: porId.a })).toEqual([porId.a]);
    expect(await folios({ q: "CLIENTE DOS" })).toEqual([porId.e, porId.d]);
    expect(await folios({ q: "valpo" })).toEqual([porId.e, porId.d]);
    expect((await folios({ q: "perez" })).length).toBe(5); // "Ana Pérez" sin tilde
    expect((await folios({ q: "preventiva" })).length).toBe(5); // motivo
    expect(await folios({ q: "zzzz" })).toEqual([]);
  });

  it("un texto con comodines de LIKE no se interpreta como patrón", async () => {
    expect(await folios({ q: "%" })).toEqual([]);
    expect(await folios({ q: "_" })).toEqual([]);
  });

  it("límite y paginación: parte la lista, no repite ni se salta visitas, y la página fuera de rango cae en la última", async () => {
    const p1 = await buscarVisitas(f({ limite: 2, pagina: 1 }));
    const p2 = await buscarVisitas(f({ limite: 2, pagina: 2 }));
    const p3 = await buscarVisitas(f({ limite: 2, pagina: 3 }));
    expect([p1.visitas.length, p2.visitas.length, p3.visitas.length]).toEqual([2, 2, 1]);
    expect(p1.paginas).toBe(3);
    expect(p1.total).toBe(5);
    const juntas = [...p1.visitas, ...p2.visitas, ...p3.visitas].map((v) => v.folio);
    expect(new Set(juntas).size).toBe(5);
    expect(juntas.sort()).toEqual(sinEliminada().sort());
    const fuera = await buscarVisitas(f({ limite: 2, pagina: 99 }));
    expect(fuera.pagina).toBe(3);
    expect(fuera.visitas.length).toBe(1);
  });

  it("filtros combinados se suman (AND)", async () => {
    expect(await folios({ estados: ["PROGRAMADA"], clienteIds: [String(otroClienteId)] })).toEqual([porId.d]);
    expect(await folios({ estados: ["PROGRAMADA"], regiones: ["Metropolitana"], q: "centro" })).toEqual([porId.a]);
  });

  it("las opciones del selector traen solo clientes, tiendas, malls y regiones que tienen visitas", async () => {
    const o = await opcionesFiltroVisitas([String(otroClienteId)]);
    expect(o.clientes.map((c) => c[1]).sort()).toEqual(["Cliente Dos", "Cliente Uno"]);
    expect(o.tiendas.map((t) => t[1])).toEqual(["Tienda Valpo"]);
    expect(o.malls.map((x) => x[1])).toEqual(["Mall Plaza"]);
    expect(o.regiones).toEqual(expect.arrayContaining(["Metropolitana", "Valparaíso"]));
  });
});
