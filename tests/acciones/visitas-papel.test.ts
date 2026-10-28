import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/catalogos");
vi.mock("@/lib/data/visitas-papel");
vi.mock("@/lib/data/sql", async (importar) => {
  const real = await importar<typeof import("@/lib/data/sql")>();
  return { ...real, consultaCon: vi.fn() };
});

import { revalidatePath } from "next/cache";
import { crearVisitasPapelAction, firmantesDeSucursalesAction } from "@/app/actions/visitas-papel";
import { listarMotivos, listarTrabajos } from "@/lib/data/catalogos";
import { consultaCon } from "@/lib/data/sql";
import { crearInformePapel } from "@/lib/data/visitas-papel";
import { hoyISO } from "@/lib/ui/fecha";
import { entrarComo, salir } from "../helpers/sesion";

const informe = (extra: Record<string, unknown> = {}) => ({
  clienteId: 1,
  sucursalId: 2,
  tecnicoId: 3,
  tecnicoAyudanteId: null,
  motivosCodigos: ["VISITA"],
  trabajos: [{ codigo: "CAMBIO", motivoCodigo: null, detalle: null, subtrabajos: [] }],
  fecha: "2024-05-10",
  firmanteNombre: "  María Soto ",
  firmanteRut: "11.111.111-1",
  descripcion: "  Se revisaron las antenas  ",
  ...extra,
});

/** La base simulada responde según el SQL: sucursales (id, cliente) o técnicos (id). */
function baseSimulada(sucursales = [{ id: 2, cliente_id: 1 }], tecnicos = [{ id: 3 }, { id: 4 }]) {
  vi.mocked(consultaCon).mockImplementation((async (texto: string) => (/dmc\.sucursal/.test(texto) ? sucursales : tecnicos)) as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  salir();
  entrarComo("admin");
  vi.mocked(listarMotivos).mockResolvedValue([{ codigo: "VISITA" }, { codigo: "CALIBRACION" }] as never);
  vi.mocked(listarTrabajos).mockResolvedValue([{ codigo: "CAMBIO" }] as never);
  vi.mocked(crearInformePapel).mockResolvedValue({ ok: true, folio: "V-900" } as never);
  baseSimulada();
});

describe("crearVisitasPapelAction (informes de años anteriores)", () => {
  it("guarda el informe limpiando espacios y devuelve el folio", async () => {
    const r = await crearVisitasPapelAction({ informes: [informe()] as never });
    expect(r).toEqual({ ok: true, resultados: [{ ok: true, folio: "V-900" }] });
    expect(crearInformePapel).toHaveBeenCalledWith(
      expect.objectContaining({ firmanteNombre: "María Soto", descripcion: "Se revisaron las antenas", clienteId: 1, sucursalId: 2 }),
      1
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  it("el trabajo repetido cuenta una sola vez y cuelga del primer motivo", async () => {
    const t = { codigo: "CAMBIO", motivoCodigo: null, detalle: null, subtrabajos: [{ etiqueta: "A", cantidad: 0 }] };
    await crearVisitasPapelAction({ informes: [informe({ trabajos: [t, t], motivosCodigos: ["CALIBRACION", "VISITA"] })] as never });
    const guardado = vi.mocked(crearInformePapel).mock.calls[0][0];
    expect(guardado.trabajos).toHaveLength(1);
    expect(guardado.trabajos![0].motivoCodigo).toBe("CALIBRACION");
    // Cantidad 0 o inválida se guarda como 1: un subtrabajo marcado existe.
    expect(guardado.trabajos![0].subtrabajos[0].cantidad).toBe(1);
  });

  describe("cada informe se valida contra la base antes de guardarse", () => {
    it.each([
      ["sucursal de otro cliente", { clienteId: 99 }, "La sucursal no es de ese cliente."],
      ["sin técnico", { tecnicoId: 0 }, "Elige el técnico que hizo el trabajo."],
      ["técnico inexistente", { tecnicoId: 777 }, "Elige el técnico que hizo el trabajo."],
      ["ayudante inexistente", { tecnicoAyudanteId: 777 }, "Ese ayudante no existe."],
      ["ayudante igual al técnico", { tecnicoAyudanteId: 3 }, "El ayudante no puede ser el mismo técnico."],
      ["sin motivo", { motivosCodigos: [] }, "Elige el motivo."],
      ["motivo que ya no existe", { motivosCodigos: ["BORRADO"] }, "Ese motivo ya no existe en el checklist."],
      ["sin fecha", { fecha: "" }, "Falta la fecha del informe."],
      ["fecha imposible", { fecha: "2024-13-45" }, "Falta la fecha del informe."],
      ["fecha futura", { fecha: "2999-01-01" }, "La fecha del informe no puede ser futura."],
      ["fecha anterior a 2015", { fecha: "2014-12-31" }, "La fecha es anterior a 2015."],
      ["sin firmante", { firmanteNombre: "  " }, "Falta quién firmó el informe."],
      ["sin descripción", { descripcion: " " }, "Falta la descripción del informe."],
      ["trabajo que ya no existe", { trabajos: [{ codigo: "BORRADO", motivoCodigo: null, detalle: null, subtrabajos: [] }] }, "Uno de los trabajos ya no está en el checklist."],
    ])("rechaza %s", async (_n, extra, error) => {
      const r = await crearVisitasPapelAction({ informes: [informe(extra)] as never });
      expect(r.ok).toBe(false);
      expect(r.resultados).toEqual([{ ok: false, error }]);
      expect(crearInformePapel).not.toHaveBeenCalled();
    });

    it("hoy es una fecha válida", async () => {
      expect((await crearVisitasPapelAction({ informes: [informe({ fecha: hoyISO() })] as never })).ok).toBe(true);
    });
  });

  it("si un informe falla, los demás igual quedan; cada resultado va en su posición", async () => {
    vi.mocked(crearInformePapel)
      .mockResolvedValueOnce({ ok: true, folio: "V-1" } as never)
      .mockResolvedValueOnce({ ok: false, error: "Ya hay una visita ese día.", repetidaFolio: "V-77" } as never)
      .mockRejectedValueOnce(new Error("boom"));
    const r = await crearVisitasPapelAction({ informes: [informe(), informe({ fecha: "2024-05-11" }), informe({ fecha: "2024-05-12" })] as never });
    expect(r.ok).toBe(false);
    expect(r.resultados).toEqual([
      { ok: true, folio: "V-1" },
      { ok: false, error: "Ya hay una visita ese día.", repetida: true },
      { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." },
    ]);
  });

  it("un informe inválido no impide guardar los válidos del mismo lote", async () => {
    const r = await crearVisitasPapelAction({ informes: [informe({ descripcion: "" }), informe()] as never });
    expect(r.resultados.map((x) => x.ok)).toEqual([false, true]);
    expect(crearInformePapel).toHaveBeenCalledTimes(1);
  });

  it("deja pasar una repetida solo si el usuario lo confirmó", async () => {
    await crearVisitasPapelAction({ informes: [informe({ aunqueRepetida: true })] as never });
    expect(vi.mocked(crearInformePapel).mock.calls[0][0].aunqueRepetida).toBe(true);
    await crearVisitasPapelAction({ informes: [informe()] as never });
    expect(vi.mocked(crearInformePapel).mock.calls[1][0].aunqueRepetida).toBe(false);
  });

  it("rechaza lotes vacíos y de más de 150, devolviendo un resultado por informe", async () => {
    expect((await crearVisitasPapelAction({ informes: [] })).error).toBe("Agrega al menos un informe.");
    const r = await crearVisitasPapelAction({ informes: Array.from({ length: 151 }, () => informe()) as never });
    expect(r.ok).toBe(false);
    expect(r.resultados).toHaveLength(151);
    expect(crearInformePapel).not.toHaveBeenCalled();
  });

  it("sin permiso, o con un cuerpo que no es un lote, no hace nada", async () => {
    salir();
    expect((await crearVisitasPapelAction({ informes: [informe()] as never })).error).toBe("No tienes permiso para crear visitas.");
    entrarComo("admin");
    expect((await crearVisitasPapelAction(null as never)).ok).toBe(false);
    expect((await crearVisitasPapelAction({ informes: "x" } as never)).ok).toBe(false);
    expect(crearInformePapel).not.toHaveBeenCalled();
  });
});

describe("firmantesDeSucursalesAction (sugerencias del campo «Firmó»)", () => {
  it("agrupa por sucursal y trae como máximo 8 por tienda", async () => {
    const filas = [
      ...Array.from({ length: 10 }, (_, i) => ({ sucursal_id: 2, nombre: `Persona ${i}`, rut: i === 0 ? "1-9" : null, n: 10 - i })),
      { sucursal_id: 5, nombre: "Otra", rut: null, n: 1 },
    ];
    vi.mocked(consultaCon).mockResolvedValue(filas as never);
    const r = await firmantesDeSucursalesAction({ sucursalIds: [2, 5, 2] });
    expect(r["2"]).toHaveLength(8);
    expect(r["2"][0]).toEqual({ nombre: "Persona 0", rut: "1-9" });
    expect(r["2"][1].rut).toBe("");
    expect(r["5"]).toEqual([{ nombre: "Otra", rut: "" }]);
  });

  it("sin permiso, sin ids válidos o si falla la base devuelve {}", async () => {
    salir();
    expect(await firmantesDeSucursalesAction({ sucursalIds: [2] })).toEqual({});
    expect(consultaCon).not.toHaveBeenCalled();
    entrarComo("admin");
    expect(await firmantesDeSucursalesAction({ sucursalIds: [0] })).toEqual({});
    expect(await firmantesDeSucursalesAction({ sucursalIds: "x" } as never)).toEqual({});
    vi.mocked(consultaCon).mockRejectedValue(new Error("boom"));
    expect(await firmantesDeSucursalesAction({ sucursalIds: [2] })).toEqual({});
  });

  it("la consulta va parametrizada (los ids no se interpolan en el SQL)", async () => {
    vi.mocked(consultaCon).mockResolvedValue([] as never);
    await firmantesDeSucursalesAction({ sucursalIds: [2, 5] });
    const [texto, params] = vi.mocked(consultaCon).mock.calls[0];
    expect(texto).not.toMatch(/\b2, ?5\b/);
    expect(params).toEqual([["ids", expect.anything(), "[2,5]"]]);
  });
});
