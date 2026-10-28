import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/visitas");
vi.mock("@/lib/data/visitas-lote");
vi.mock("@/lib/data/avisos-problema", async (importar) => {
  const real = await importar<typeof import("@/lib/data/avisos-problema")>();
  return { ...real, problemasSinResolver: vi.fn(), sucursalesConProblemas: vi.fn() };
});
vi.mock("@/lib/data/pendientes");
vi.mock("@/lib/data/problemas");
vi.mock("@/lib/data/catalogos");
vi.mock("@/lib/data/solicitudes-password");
vi.mock("@/lib/data/auditoria");

import { revalidatePath } from "next/cache";
import * as admin from "@/app/actions/admin";
import {
  actualizarProblema,
  cancelarVisitaPorAdmin,
  crearVisita,
  editarVisita,
  eliminarVisita,
  getVisitaCompletaPorFolio,
  liberarVisita,
  registrarEnvioActa,
  reprogramarVisita,
} from "@/lib/data/visitas";
import { modificarVisita } from "@/lib/data/visitas-lote";
import { ErrorDeAviso, problemasSinResolver, sucursalesConProblemas } from "@/lib/data/avisos-problema";
import { marcarGestionPendiente } from "@/lib/data/pendientes";
import { marcarGestionProblema } from "@/lib/data/problemas";
import { esEstadoProblemaVigente, guardarChecklist, listarMotivos } from "@/lib/data/catalogos";
import { atenderSolicitudPassword, descartarSolicitudPassword } from "@/lib/data/solicitudes-password";
import { auditar } from "@/lib/data/auditoria";
import { entrarComo, salir } from "../helpers/sesion";

const datos = (extra: Record<string, unknown> = {}) => ({
  clienteId: 1,
  sucursalId: 2,
  tecnicoId: 3,
  tecnicoAyudanteId: null,
  motivoCodigo: "VISITA",
  motivosCodigos: ["VISITA"],
  fechaProgramada: "2026-11-02",
  fechaHasta: null,
  horaProgramada: null,
  trabajoSolicitado: "Revisar antenas",
  indicacionesAcceso: null,
  responsableNombre: null,
  responsableRut: null,
  responsableTelefono: null,
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  salir();
  entrarComo("admin");
  vi.mocked(listarMotivos).mockResolvedValue([
    { codigo: "VISITA", nombre: "Visita preventiva" },
    { codigo: "INSTALACION", nombre: "Instalación de las antenas" },
  ] as never);
});

describe("crearVisitaAction", () => {
  beforeEach(() => {
    vi.mocked(crearVisita).mockResolvedValue({ folio: "V-50" } as never);
  });

  it("crea la visita exigiendo el aviso de problemas y devuelve el folio", async () => {
    expect(await admin.crearVisitaAction(datos() as never)).toEqual({ ok: true, folio: "V-50" });
    expect(crearVisita).toHaveBeenCalledWith(expect.objectContaining({ sucursalId: 2 }), 1, { exigirAviso: true });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/visitas/V-50");
  });

  it.each([
    ["sin cliente", { clienteId: 0 }, /Cliente, sucursal y técnico/],
    ["sin sucursal", { sucursalId: 0 }, /Cliente, sucursal y técnico/],
    ["sin técnico", { tecnicoId: 0 }, /Cliente, sucursal y técnico/],
    ["sin descripción del trabajo", { trabajoSolicitado: "   " }, /Escribe qué se necesita hacer/],
    ["sin fecha", { fechaProgramada: "" }, /Elige la fecha programada/],
    ["margen que no termina después", { fechaHasta: "2026-11-02" }, /fecha «hasta» tiene que ser posterior/],
    ["margen que termina antes", { fechaHasta: "2026-10-30" }, /fecha «hasta» tiene que ser posterior/],
    ["ayudante igual al técnico", { tecnicoAyudanteId: 3 }, /ayudante no puede ser el mismo/],
    ["instalación sin hora", { motivoCodigo: "INSTALACION", motivosCodigos: ["INSTALACION"] }, /hora es obligatoria/],
    ["fecha mal escrita", { fechaProgramada: "02-11-2026" }, /fecha no es válida/],
  ])("rechaza %s sin llamar a la base", async (_n, extra, mensaje) => {
    const r = await admin.crearVisitaAction(datos(extra) as never);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(mensaje);
    expect(crearVisita).not.toHaveBeenCalled();
  });

  it("una instalación con hora, y un margen válido, pasan", async () => {
    expect((await admin.crearVisitaAction(datos({ motivoCodigo: "INSTALACION", motivosCodigos: ["INSTALACION"], horaProgramada: "09:00" }) as never)).ok).toBe(true);
    expect((await admin.crearVisitaAction(datos({ fechaHasta: "2026-11-06" }) as never)).ok).toBe(true);
  });

  it("traduce los errores de restricción de la base a mensajes entendibles", async () => {
    const casos: [string, RegExp][] = [
      ["conflicted with CHECK constraint ck_visita_fecha_hasta", /fecha «hasta»/],
      ["FOREIGN KEY constraint fk_visita_motivo_catalogo", /Ese motivo ya no existe/],
      ["CHECK constraint ck_visita_ayudante", /ayudante no puede ser/],
      ["CHECK constraint ck_problema_otro_desc", /necesita una descripción/],
    ];
    for (const [texto, esperado] of casos) {
      vi.mocked(crearVisita).mockRejectedValueOnce(new Error(texto));
      expect((await admin.crearVisitaAction(datos() as never)).error).toMatch(esperado);
    }
  });

  it("una respuesta inválida al aviso de problemas llega tal cual a quien agenda", async () => {
    vi.mocked(crearVisita).mockRejectedValueOnce(new ErrorDeAviso("Marca qué problema va a resolver la visita."));
    expect(await admin.crearVisitaAction(datos() as never)).toEqual({ ok: false, error: "Marca qué problema va a resolver la visita." });
  });

  it("un fallo desconocido no filtra detalles internos", async () => {
    vi.mocked(crearVisita).mockRejectedValueOnce(new Error("Cannot open database \"DMC_Contingencia\" requested by the login"));
    const r = await admin.crearVisitaAction(datos() as never);
    expect(r.error).toBe("No se pudo guardar en el servidor. Inténtalo otra vez.");
  });
});

describe("crearVisitasMasivasAction (ruta de un técnico)", () => {
  const ruta = (...sucursales: number[]) => sucursales.map((s) => datos({ sucursalId: s }));

  beforeEach(() => {
    vi.mocked(sucursalesConProblemas).mockResolvedValue([]);
    let n = 0;
    vi.mocked(crearVisita).mockImplementation((async () => ({ folio: `V-${++n}` })) as never);
  });

  it("crea una visita por local y devuelve los folios", async () => {
    const r = await admin.crearVisitasMasivasAction(ruta(10, 11, 12) as never);
    expect(r).toEqual({ ok: true, error: undefined, folios: ["V-1", "V-2", "V-3"], fallidas: [] });
    expect(crearVisita).toHaveBeenCalledTimes(3);
    expect(vi.mocked(crearVisita).mock.calls[0][0]).toMatchObject({ problemaOrigenId: null, creadaEnTerreno: false });
  });

  it("valida TODO antes de escribir algo: un local malo frena a toda la ruta", async () => {
    const r = await admin.crearVisitasMasivasAction([...ruta(10, 11), datos({ sucursalId: 12, trabajoSolicitado: "" })] as never);
    expect(r.ok).toBe(false);
    expect(r.folios).toEqual([]);
    expect(r.fallidas).toEqual([10, 11, 12]);
    expect(crearVisita).not.toHaveBeenCalled();
  });

  it("rechaza ruta vacía y locales repetidos", async () => {
    expect((await admin.crearVisitasMasivasAction([])).error).toBe("Agrega al menos un local a la ruta.");
    expect((await admin.crearVisitasMasivasAction(ruta(10, 10) as never)).error).toBe("Hay un local repetido en la ruta.");
  });

  it("una instalación sin hora en cualquier local frena la ruta", async () => {
    const r = await admin.crearVisitasMasivasAction([datos({ sucursalId: 10, motivoCodigo: "INSTALACION", motivosCodigos: ["INSTALACION"] })] as never);
    expect(r.error).toBe("En instalación la hora es obligatoria en cada local.");
  });

  it("los locales con problemas sin resolver se dejan fuera y se avisa; los demás se agendan", async () => {
    vi.mocked(sucursalesConProblemas).mockResolvedValue([11]);
    const r = await admin.crearVisitasMasivasAction(ruta(10, 11, 12) as never);
    expect(r.ok).toBe(false);
    expect(r.folios).toHaveLength(2);
    expect(r.fallidas).toEqual([11]);
    expect(r.error).toMatch(/Un local tiene problemas sin resolver/);
  });

  it("si varios locales tienen problemas el aviso va en plural", async () => {
    vi.mocked(sucursalesConProblemas).mockResolvedValue([10, 11]);
    expect((await admin.crearVisitasMasivasAction(ruta(10, 11, 12) as never)).error).toMatch(/2 locales tienen problemas/);
  });

  it("si la base falla en uno, los anteriores quedan creados y se informa cuál faltó", async () => {
    let n = 0;
    vi.mocked(crearVisita).mockImplementation((async () => {
      if (++n === 2) throw new Error("deadlock");
      return { folio: `V-${n}` };
    }) as never);
    const r = await admin.crearVisitasMasivasAction(ruta(10, 11, 12) as never);
    expect(r.ok).toBe(false);
    expect(r.folios).toEqual(["V-1", "V-3"]);
    expect(r.fallidas).toEqual([11]);
  });

  it("lo que no es un arreglo no rompe la acción", async () => {
    const r = await admin.crearVisitasMasivasAction({ x: 1 } as never);
    expect(r.ok).toBe(false);
    expect(r.fallidas).toEqual([]);
  });
});

describe("editar, reprogramar, cancelar, liberar y eliminar", () => {
  it("editarVisitaAction: edita, y responde «no encontramos» si no existe", async () => {
    vi.mocked(editarVisita).mockResolvedValue(true as never);
    expect(await admin.editarVisitaAction("V-1", datos() as never)).toEqual({ ok: true, folio: "V-1" });
    expect(editarVisita).toHaveBeenCalledWith("V-1", expect.anything(), 1);
    vi.mocked(editarVisita).mockResolvedValue(false as never);
    expect((await admin.editarVisitaAction("V-1", datos() as never)).error).toBe("No encontramos esa visita.");
  });

  it("editarVisitaAction aplica las mismas reglas que crear", async () => {
    expect((await admin.editarVisitaAction("V-1", datos({ fechaHasta: "2026-11-01" }) as never)).error).toMatch(/«hasta»/);
    expect((await admin.editarVisitaAction("V-1", datos({ tecnicoAyudanteId: 3 }) as never)).error).toMatch(/ayudante/);
    expect(editarVisita).not.toHaveBeenCalled();
  });

  describe("reprogramarVisitaAction", () => {
    const pedido = (extra: Record<string, unknown> = {}) => ({ folio: "V-1", tecnicoId: 4, fecha: "2026-11-09", hora: "10:00", ...extra }) as never;

    it("reprograma y exige el aviso de problemas", async () => {
      vi.mocked(reprogramarVisita).mockResolvedValue(true as never);
      expect(await admin.reprogramarVisitaAction(pedido())).toEqual({ ok: true, folio: "V-1" });
      expect(reprogramarVisita).toHaveBeenCalledWith(expect.objectContaining({ folio: "V-1", tecnicoId: 4, fecha: "2026-11-09", hora: "10:00", exigirAviso: true, usuarioId: 1 }));
    });

    it("datos incompletos: pide el técnico y la fecha", async () => {
      expect((await admin.reprogramarVisitaAction(pedido({ fecha: "" }))).error).toBe("Elige el técnico y la nueva fecha.");
      expect((await admin.reprogramarVisitaAction(pedido({ tecnicoId: 0 }))).error).toBe("Elige el técnico y la nueva fecha.");
    });

    it("sin hora, si la visita tiene una instalación, no deja", async () => {
      vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue({ motivosCodigos: ["INSTALACION"] } as never);
      expect((await admin.reprogramarVisitaAction(pedido({ hora: null }))).error).toBe("En instalación la hora es obligatoria.");
      vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue({ motivosCodigos: ["VISITA"] } as never);
      vi.mocked(reprogramarVisita).mockResolvedValue(true as never);
      expect((await admin.reprogramarVisitaAction(pedido({ hora: null }))).ok).toBe(true);
    });

    it("visita inexistente", async () => {
      vi.mocked(reprogramarVisita).mockResolvedValue(false as never);
      expect((await admin.reprogramarVisitaAction(pedido())).error).toBe("No encontramos esa visita.");
    });
  });

  describe("cancelarVisitaAdminAction", () => {
    it("exige un motivo de al menos 10 caracteres (queda en la bitácora)", async () => {
      expect((await admin.cancelarVisitaAdminAction({ folio: "V-1", motivo: "corto" })).error).toMatch(/queda en la bitácora/);
      expect((await admin.cancelarVisitaAdminAction({ folio: "V-1", motivo: "         x" })).error).toMatch(/queda en la bitácora/);
      expect(cancelarVisitaPorAdmin).not.toHaveBeenCalled();
    });

    it("cancela con el motivo recortado y devuelve el error de negocio de la base (p. ej. ya completada)", async () => {
      vi.mocked(cancelarVisitaPorAdmin).mockResolvedValueOnce(null as never);
      expect((await admin.cancelarVisitaAdminAction({ folio: "V-1", motivo: "  Local cerrado definitivamente  " })).ok).toBe(true);
      expect(cancelarVisitaPorAdmin).toHaveBeenCalledWith({ folio: "V-1", motivo: "Local cerrado definitivamente", usuarioId: 1 });
      vi.mocked(cancelarVisitaPorAdmin).mockResolvedValueOnce({ error: "La visita ya está completada." } as never);
      expect(await admin.cancelarVisitaAdminAction({ folio: "V-1", motivo: "Local cerrado definitivamente" })).toEqual({
        ok: false,
        error: "La visita ya está completada.",
      });
    });
  });

  it("liberarVisitaAction: libera, pasa el error de negocio y valida el folio", async () => {
    vi.mocked(liberarVisita).mockResolvedValueOnce(null as never);
    expect(await admin.liberarVisitaAction("V-1")).toEqual({ ok: true, folio: "V-1" });
    vi.mocked(liberarVisita).mockResolvedValueOnce({ error: "La visita no está en curso." } as never);
    expect((await admin.liberarVisitaAction("V-1")).error).toBe("La visita no está en curso.");
    expect((await admin.liberarVisitaAction("")).error).toBe("No encontramos esa visita.");
  });

  it("eliminarVisitaAction: pasa la confirmación escrita a la base, audita y refresca", async () => {
    vi.mocked(eliminarVisita).mockResolvedValueOnce(null as never);
    expect((await admin.eliminarVisitaAction({ folio: "V-1", confirmacionFolio: "V-1" })).ok).toBe(true);
    expect(eliminarVisita).toHaveBeenCalledWith({ folio: "V-1", confirmacionFolio: "V-1", usuarioId: 1 });
    expect(auditar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accion: "visita.eliminar", entidadId: "V-1" }));
  });

  it("eliminarVisitaAction: si la base rechaza (confirmación errónea), no audita", async () => {
    vi.mocked(eliminarVisita).mockResolvedValueOnce({ error: "Escribe el folio para confirmar." } as never);
    expect((await admin.eliminarVisitaAction({ folio: "V-1", confirmacionFolio: "V-2" })).error).toBe("Escribe el folio para confirmar.");
    expect(auditar).not.toHaveBeenCalled();
  });
});

describe("problemasSinResolverAction (aviso al agendar)", () => {
  it("lo puede pedir quien crea o quien reprograma", async () => {
    vi.mocked(problemasSinResolver).mockResolvedValue([{ id: 1 }] as never);
    entrarComo("coordinador", { permisos: ["visitas.reprogramar"] });
    expect(await admin.problemasSinResolverAction({ sucursalId: 2 })).toEqual({ ok: true, problemas: [{ id: 1 }] });
    entrarComo("coordinador", { permisos: ["visitas.crear"] });
    expect((await admin.problemasSinResolverAction({ sucursalId: 2, folio: "V-1" })).ok).toBe(true);
    expect(problemasSinResolver).toHaveBeenLastCalledWith(2, "V-1");
  });

  it("quien solo mira no puede, y una sucursal inválida se rechaza", async () => {
    entrarComo("coordinador", { permisos: ["visitas.ver"] });
    expect((await admin.problemasSinResolverAction({ sucursalId: 2 })).ok).toBe(false);
    entrarComo("admin");
    expect((await admin.problemasSinResolverAction({ sucursalId: 0 })).ok).toBe(false);
  });

  it("si la base falla devuelve una lista vacía y un aviso", async () => {
    vi.mocked(problemasSinResolver).mockRejectedValue(new Error("boom"));
    expect(await admin.problemasSinResolverAction({ sucursalId: 2 })).toEqual({
      ok: false,
      error: "No se pudieron revisar los problemas de la sucursal.",
      problemas: [],
    });
  });
});

describe("acciones para múltiples visitas", () => {
  it("exigen el permiso «masivo» Y el de la operación", async () => {
    entrarComo("coordinador", { permisos: ["visitas.editar"] });
    expect((await admin.modificarVisitasAction([{ folio: "V-1", cambios: { tecnicoId: 3 } }])).error).toMatch(/No tienes permiso/);
    entrarComo("coordinador", { permisos: ["visitas.masivo"] });
    expect((await admin.modificarVisitasAction([{ folio: "V-1", cambios: { tecnicoId: 3 } }])).error).toMatch(/No tienes permiso/);
    expect(modificarVisita).not.toHaveBeenCalled();
  });

  describe("modificarVisitasAction", () => {
    it("aplica a cada visita sus cambios y reporta las que fallan sin frenar las demás", async () => {
      vi.mocked(modificarVisita).mockImplementation((async (folio: string) => (folio === "V-2" ? { error: "Ya está completada." } : null)) as never);
      const r = await admin.modificarVisitasAction([
        { folio: "V-1", cambios: { tecnicoId: 3 } },
        { folio: "V-2", cambios: { fecha: "2026-11-03" } },
        { folio: "V-3", cambios: { hora: "09:30" } },
      ]);
      expect(r).toEqual({ ok: false, hechas: ["V-1", "V-3"], fallidas: [{ folio: "V-2", error: "Ya está completada." }] });
    });

    it("rechaza una tanda vacía, repetida, o con una visita sin cambios", async () => {
      expect((await admin.modificarVisitasAction([])).error).toBe("No hay ninguna visita seleccionada.");
      expect(
        (await admin.modificarVisitasAction([
          { folio: "V-1", cambios: { tecnicoId: 3 } },
          { folio: "V-1", cambios: { tecnicoId: 3 } },
        ])).error
      ).toBe("Hay una visita repetida en la selección.");
      expect((await admin.modificarVisitasAction([{ folio: "V-1", cambios: {} }])).error).toBe("V-1 no tiene ningún cambio.");
      expect(modificarVisita).not.toHaveBeenCalled();
    });

    it("rechaza más de 25 visitas de una vez", async () => {
      const muchas = Array.from({ length: 26 }, (_, i) => ({ folio: `V-${i + 1}`, cambios: { tecnicoId: 3 } }));
      expect((await admin.modificarVisitasAction(muchas)).error).toBe("Son demasiadas visitas de una vez.");
    });

    it("un error inesperado en una visita se reporta en esa fila", async () => {
      vi.mocked(modificarVisita).mockRejectedValueOnce(new Error("CHECK constraint ck_visita_ayudante"));
      const r = await admin.modificarVisitasAction([{ folio: "V-1", cambios: { tecnicoId: 3 } }]);
      expect(r.fallidas).toEqual([{ folio: "V-1", error: "El ayudante no puede ser el mismo técnico asignado." }]);
    });
  });

  describe("cancelarVisitasAdminAction", () => {
    it("cada visita necesita su motivo de 10+ caracteres", async () => {
      const r = await admin.cancelarVisitasAdminAction([
        { folio: "V-1", motivo: "Cierre definitivo del local" },
        { folio: "V-2", motivo: "corto" },
      ]);
      expect(r.error).toMatch(/V-2: escribe por qué/);
      expect(cancelarVisitaPorAdmin).not.toHaveBeenCalled();
    });

    it("cancela todas las que se pueda", async () => {
      vi.mocked(cancelarVisitaPorAdmin).mockResolvedValue(null as never);
      const r = await admin.cancelarVisitasAdminAction([
        { folio: "V-1", motivo: "Cierre definitivo del local" },
        { folio: "V-2", motivo: "Cierre definitivo del local" },
      ]);
      expect(r).toEqual({ ok: true, hechas: ["V-1", "V-2"], fallidas: [] });
    });
  });

  describe("eliminarVisitasAction", () => {
    const pedido = (extra: Record<string, unknown> = {}) => ({ folios: ["V-1", "V-2"], total: 2, confirmacion: "ELIMINAR 2", ...extra });

    it("exige escribir «ELIMINAR n» con el total que se le mostró", async () => {
      for (const confirmacion of ["", "eliminar", "ELIMINAR 3", "ELIMINAR"]) {
        const r = await admin.eliminarVisitasAction(pedido({ confirmacion }));
        expect(r.error, confirmacion).toMatch(/La confirmación no coincide/);
      }
      expect(eliminarVisita).not.toHaveBeenCalled();
    });

    it("acepta la confirmación sin importar mayúsculas ni espacios, elimina y audita cada una", async () => {
      vi.mocked(eliminarVisita).mockResolvedValue(null as never);
      const r = await admin.eliminarVisitasAction(pedido({ confirmacion: "  eliminar 2 " }));
      expect(r).toEqual({ ok: true, hechas: ["V-1", "V-2"], fallidas: [] });
      expect(auditar).toHaveBeenCalledTimes(2);
    });

    it("una tanda no puede traer más folios que el total confirmado", async () => {
      const r = await admin.eliminarVisitasAction(pedido({ total: 1, confirmacion: "ELIMINAR 1" }));
      expect(r.error).toMatch(/La confirmación no coincide/);
    });

    it("una visita que no se pudo eliminar no se audita", async () => {
      vi.mocked(eliminarVisita).mockImplementation((async ({ folio }: { folio: string }) => (folio === "V-2" ? { error: "No existe." } : null)) as never);
      const r = await admin.eliminarVisitasAction(pedido());
      expect(r.hechas).toEqual(["V-1"]);
      expect(r.fallidas).toEqual([{ folio: "V-2", error: "No existe." }]);
      expect(auditar).toHaveBeenCalledTimes(1);
    });
  });
});

describe("problemas, pendientes y envío del acta", () => {
  it("actualizarProblemaAction: el estado debe existir hoy en el checklist", async () => {
    vi.mocked(esEstadoProblemaVigente).mockResolvedValue(false as never);
    expect((await admin.actualizarProblemaAction({ problemaId: 1, estado: "ABIERTO", tipoCodigo: "OTRO" })).error).toMatch(/Ese estado ya no existe/);
    vi.mocked(esEstadoProblemaVigente).mockResolvedValue(true as never);
    vi.mocked(actualizarProblema).mockResolvedValueOnce(true as never);
    expect((await admin.actualizarProblemaAction({ problemaId: 1, estado: "RESUELTO", tipoCodigo: "OTRO", nota: "  listo  " })).ok).toBe(true);
    expect(actualizarProblema).toHaveBeenCalledWith(1, "RESUELTO", "OTRO", 1, "listo");
    vi.mocked(actualizarProblema).mockResolvedValueOnce(false as never);
    expect((await admin.actualizarProblemaAction({ problemaId: 99, estado: "RESUELTO", tipoCodigo: "OTRO" })).error).toBe("No encontramos ese problema.");
  });

  it("actualizarProblemaAction: un estado de más de 10 caracteres se rechaza antes de consultar", async () => {
    const r = await admin.actualizarProblemaAction({ problemaId: 1, estado: "ESTADO_MUY_LARGO" as never, tipoCodigo: "OTRO" });
    expect(r.ok).toBe(false);
    expect(esEstadoProblemaVigente).not.toHaveBeenCalled();
  });

  it("marcarGestionPendienteAction / marcarGestionProblemaAction pasan el error de negocio", async () => {
    vi.mocked(marcarGestionPendiente).mockResolvedValueOnce({ error: "No es un pendiente." } as never);
    expect((await admin.marcarGestionPendienteAction({ folio: "V-1", codigo: "LLAMAR", marcado: true })).error).toBe("No es un pendiente.");
    vi.mocked(marcarGestionPendiente).mockResolvedValueOnce(null as never);
    expect(await admin.marcarGestionPendienteAction({ folio: "V-1", codigo: "LLAMAR", marcado: true })).toEqual({ ok: true, folio: "V-1" });
    vi.mocked(marcarGestionProblema).mockResolvedValueOnce(null as never);
    expect((await admin.marcarGestionProblemaAction({ problemaId: 4, codigo: "LLAMAR", marcado: false })).ok).toBe(true);
    expect(marcarGestionProblema).toHaveBeenCalledWith({ problemaId: 4, codigo: "LLAMAR", marcado: false, usuarioId: 1 });
  });

  describe("enviarActaAction", () => {
    const pedido = (extra: Record<string, unknown> = {}) => ({ folio: "V-1", para: "cliente@example.com", cc: "", asunto: "Acta V-1", adjuntos: 2, ...extra });

    it("registra el envío con un cuerpo por defecto", async () => {
      vi.mocked(registrarEnvioActa).mockResolvedValue(true as never);
      expect((await admin.enviarActaAction(pedido())).ok).toBe(true);
      expect(registrarEnvioActa).toHaveBeenCalledWith(expect.objectContaining({ cuerpo: "Acta de la visita V-1.", adjuntos: 2, usuarioId: 1 }));
    });

    it("exige un destinatario con @ y un asunto", async () => {
      expect((await admin.enviarActaAction(pedido({ para: "sin-arroba" }))).error).toBe("Escribe el correo del destinatario.");
      expect((await admin.enviarActaAction(pedido({ asunto: "  " }))).error).toBe("El asunto no puede ir vacío.");
      expect(registrarEnvioActa).not.toHaveBeenCalled();
    });

    it("visita inexistente", async () => {
      vi.mocked(registrarEnvioActa).mockResolvedValue(false as never);
      expect((await admin.enviarActaAction(pedido())).error).toBe("No encontramos esa visita.");
    });
  });
});

describe("checklist", () => {
  const vacio = {
    motivos: [],
    problemas: [],
    trabajos: [],
    internos: [],
    pendientes: [],
    gestionProblemas: [],
    estadosProblema: [],
    cargos: [],
  };

  it("rechaza un borrador mal formado sin guardar nada", async () => {
    expect((await admin.guardarChecklistAction({ motivos: "no" } as never)).ok).toBe(false);
    expect(guardarChecklist).not.toHaveBeenCalled();
  });

  it("no deja dos entradas con el mismo nombre en una lista (sin importar mayúsculas)", async () => {
    const dosMotivos = { ...vacio, motivos: [
      { id: null, codigo: "A", nombre: "Instalación", orden: 1, activo: true },
      { id: null, codigo: "B", nombre: " INSTALACIÓN".replace("Ó", "ó").toLowerCase(), orden: 2, activo: true },
    ] };
    const r = await admin.guardarChecklistAction(dosMotivos as never);
    // O el esquema o la regla de nombres repetidos lo frenan: lo importante es que no llega a la base.
    expect(r.ok).toBe(false);
    expect(guardarChecklist).not.toHaveBeenCalled();
  });
});

describe("recuperación de contraseña (panel)", () => {
  it("atender una solicitud audita con el id de la cuenta afectada", async () => {
    vi.mocked(atenderSolicitudPassword).mockResolvedValue({ usuarioId: 42 } as never);
    expect((await admin.atenderSolicitudPasswordAction(7, "Clave-Temporal-123")).ok).toBe(true);
    expect(atenderSolicitudPassword).toHaveBeenCalledWith(7, "Clave-Temporal-123", expect.objectContaining({ usuario: expect.anything() }));
    expect(auditar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accion: "password.reseteo", entidadId: 42, detalle: { solicitudId: 7 } }));
  });

  it("si la capa de datos rechaza la clave (política), no audita", async () => {
    vi.mocked(atenderSolicitudPassword).mockResolvedValue({ error: "La contraseña es demasiado corta." } as never);
    expect((await admin.atenderSolicitudPasswordAction(7, "x")).error).toBe("La contraseña es demasiado corta.");
    expect(auditar).not.toHaveBeenCalled();
  });

  it("descartar: avisa si ya estaba cerrada", async () => {
    vi.mocked(descartarSolicitudPassword).mockResolvedValueOnce(true as never);
    expect((await admin.descartarSolicitudPasswordAction(7)).ok).toBe(true);
    vi.mocked(descartarSolicitudPassword).mockResolvedValueOnce(false as never);
    expect((await admin.descartarSolicitudPasswordAction(7)).error).toBe("Esa solicitud ya estaba cerrada.");
    expect((await admin.descartarSolicitudPasswordAction(-1)).error).toBe("Esa solicitud no existe.");
  });
});
