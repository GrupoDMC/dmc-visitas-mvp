import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/visitas");
vi.mock("@/lib/data/personas-local");
vi.mock("@/lib/data/maestros");
vi.mock("@/lib/data/catalogos");
vi.mock("@/lib/data/borradores");
vi.mock("@/lib/data/reservas");

import { revalidatePath } from "next/cache";
import {
  cambiarEstadoVisitaAction,
  crearVisitaTecnicoAction,
  guardarActaAction,
  iniciarVisitaAction,
} from "@/app/actions/visitas";
import {
  cambiarEstadoVisita,
  crearEIniciarVisita,
  getEquipoDeVisita,
  getVisitaCompletaPorFolio,
  guardarActa,
  iniciarVisita,
} from "@/lib/data/visitas";
import { registrarPersonaLocal } from "@/lib/data/personas-local";
import { getSucursal } from "@/lib/data/maestros";
import { cargoDelChecklist, listarMotivos } from "@/lib/data/catalogos";
import { borrarBorrador } from "@/lib/data/borradores";
import { estadoDeReserva, liberarReserva } from "@/lib/data/reservas";
import { TECNICO_PRUEBA, entrarComo, salir } from "../helpers/sesion";

const MIO = TECNICO_PRUEBA.id;

const visitaMia = (extra: Record<string, unknown> = {}) =>
  ({ id: 100, folio: "V-1", tecnicoId: MIO, tecnicoAyudanteId: null, responsableNombre: "Local", sucursalId: 9, ...extra }) as never;

const acta = (extra: Record<string, unknown> = {}) => ({
  folio: "V-1",
  responsableNombre: "María Soto",
  responsableRut: "11.111.111-1",
  responsableTelefono: null,
  responsableCargo: "Jefa de tienda",
  motivosCodigos: ["VISITA"],
  observaciones: null,
  comentarioInterno: null,
  trabajos: [],
  problemas: [],
  fotos: [],
  firma: { nombre: "María Soto", rut: null, dataUrl: "data:image/png;base64,AAAA" },
  dispositivo: "Pixel",
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  salir();
  entrarComo("tecnico");
  vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue(visitaMia());
  vi.mocked(getEquipoDeVisita).mockResolvedValue({
    estado: "EN_CURSO",
    tecnicoId: MIO,
    tecnicoAyudanteId: null,
    tomadaPorTecnicoId: MIO,
  });
  vi.mocked(estadoDeReserva).mockResolvedValue({ estado: "libre" } as never);
  vi.mocked(borrarBorrador).mockResolvedValue(undefined as never);
  vi.mocked(liberarReserva).mockResolvedValue(undefined as never);
  vi.mocked(cargoDelChecklist).mockResolvedValue("Jefa de tienda" as never);
});

describe("iniciarVisitaAction", () => {
  it("inicia la visita del técnico y refresca sus pantallas", async () => {
    vi.mocked(iniciarVisita).mockResolvedValue(null as never);
    expect(await iniciarVisitaAction("V-1")).toEqual({ ok: true });
    expect(iniciarVisita).toHaveBeenCalledWith("V-1", "Local", { tecnicoId: MIO, usuarioId: 3 });
    expect(revalidatePath).toHaveBeenCalledWith("/tecnico");
    expect(revalidatePath).toHaveBeenCalledWith("/tecnico/visitas/V-1");
  });

  it("un folio que no es un folio se trata igual que una visita ajena", async () => {
    const r = await iniciarVisitaAction("");
    expect(r).toEqual({ ok: false, error: "No encontramos esa visita entre las tuyas." });
    expect(getVisitaCompletaPorFolio).not.toHaveBeenCalled();
  });

  it("sin sesión de técnico (administrador o anónimo) no hay visita «entre las tuyas»", async () => {
    entrarComo("admin");
    expect((await iniciarVisitaAction("V-1")).ok).toBe(false);
    salir();
    expect((await iniciarVisitaAction("V-1")).ok).toBe(false);
    expect(iniciarVisita).not.toHaveBeenCalled();
  });

  it("una visita de otro técnico responde lo mismo que una inexistente", async () => {
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue(visitaMia({ tecnicoId: 999 }));
    const ajena = await iniciarVisitaAction("V-1");
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue(null as never);
    const inexistente = await iniciarVisitaAction("V-1");
    expect(ajena).toEqual(inexistente);
    expect(iniciarVisita).not.toHaveBeenCalled();
  });

  it("el ayudante también puede iniciarla", async () => {
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue(visitaMia({ tecnicoId: 999, tecnicoAyudanteId: MIO }));
    vi.mocked(iniciarVisita).mockResolvedValue(null as never);
    expect((await iniciarVisitaAction("V-1")).ok).toBe(true);
  });

  it("si el otro técnico ya la tomó, devuelve el motivo y refresca igual", async () => {
    vi.mocked(iniciarVisita).mockResolvedValue({ error: "El otro técnico ya inició esta visita." } as never);
    expect(await iniciarVisitaAction("V-1")).toEqual({ ok: false, error: "El otro técnico ya inició esta visita." });
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("un fallo de la base se traduce a un mensaje de conexión", async () => {
    vi.mocked(iniciarVisita).mockRejectedValue(new Error("ECONNRESET 10.1.1.1"));
    const r = await iniciarVisitaAction("V-1");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Revisa la conexión/);
    expect(r.error).not.toMatch(/10\.1\.1\.1/);
  });
});

describe("guardarActaAction (cerrar el acta)", () => {
  beforeEach(() => {
    vi.mocked(guardarActa).mockResolvedValue({ ok: true, horaTermino: "15:42" } as never);
  });

  it("cierra el acta, anota a quien firmó, borra el respaldo y devuelve la hora de término", async () => {
    const r = await guardarActaAction(acta() as never);
    expect(r).toEqual({ ok: true, horaTermino: "15:42" });
    expect(guardarActa).toHaveBeenCalledWith(expect.objectContaining({ folio: "V-1" }), { usuarioId: 3, tecnicoId: MIO });
    expect(registrarPersonaLocal).toHaveBeenCalledWith(9, {
      nombre: "María Soto",
      rut: "11.111.111-1",
      telefono: null,
      cargo: "Jefa de tienda",
    });
    expect(borrarBorrador).toHaveBeenCalledWith("V-1", 3);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/visitas/V-1");
  });

  it("sin técnico asociado no guarda nada", async () => {
    entrarComo("admin");
    expect((await guardarActaAction(acta() as never)).error).toMatch(/no tiene un técnico asociado/);
    salir();
    expect((await guardarActaAction(acta() as never)).ok).toBe(false);
    expect(guardarActa).not.toHaveBeenCalled();
  });

  it.each([
    ["sin motivos", { motivosCodigos: [] }, /al menos un motivo/],
    ["sin nombre del responsable", { responsableNombre: "   " }, /nombre del responsable/],
    ["sin firma", { firma: null }, /firma de la tienda/],
    ["«Otro» sin descripción", { problemas: [{ tipoCodigo: "OTRO", estado: "ABIERTO", descripcion: " ", solucion: null, items: [] }] }, /«Otro»/],
  ])("rechaza un acta %s antes de tocar la base", async (_n, extra, mensaje) => {
    const r = await guardarActaAction(acta(extra) as never);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(mensaje);
    expect(guardarActa).not.toHaveBeenCalled();
  });

  it("rechaza una firma que no es una imagen", async () => {
    const r = await guardarActaAction(acta({ firma: { nombre: "x", rut: null, dataUrl: "javascript:alert(1)" } }) as never);
    expect(r.ok).toBe(false);
    expect(guardarActa).not.toHaveBeenCalled();
  });

  it("rechaza fotos que no son data:image y un folio larguísimo", async () => {
    expect((await guardarActaAction(acta({ fotos: [{ dataUrl: "http://x/y.png", etiqueta: null }] }) as never)).ok).toBe(false);
    expect((await guardarActaAction(acta({ folio: "V".repeat(40) }) as never)).ok).toBe(false);
  });

  it("una visita que no existe o no es suya no se cierra", async () => {
    vi.mocked(getEquipoDeVisita).mockResolvedValue(null as never);
    expect((await guardarActaAction(acta() as never)).error).toBe("No encontramos esa visita.");

    vi.mocked(getEquipoDeVisita).mockResolvedValue({ estado: "EN_CURSO", tecnicoId: 999, tecnicoAyudanteId: null, tomadaPorTecnicoId: 999 });
    expect((await guardarActaAction(acta() as never)).error).toBe("Esa visita no está asignada a ti.");
    expect(guardarActa).not.toHaveBeenCalled();
  });

  it("una visita cancelada ya no se cierra desde el celular", async () => {
    vi.mocked(getEquipoDeVisita).mockResolvedValue({ estado: "CANCELADA", tecnicoId: MIO, tecnicoAyudanteId: null, tomadaPorTecnicoId: null });
    expect((await guardarActaAction(acta() as never)).error).toMatch(/ya no se puede cerrar/);
  });

  it("una visita ya COMPLETADA llega a guardarActa, que sabe distinguir si la cerró este mismo técnico", async () => {
    vi.mocked(getEquipoDeVisita).mockResolvedValue({ estado: "COMPLETADA", tecnicoId: MIO, tecnicoAyudanteId: null, tomadaPorTecnicoId: MIO });
    vi.mocked(guardarActa).mockResolvedValue({ ok: false, error: "El otro técnico ya cerró el acta.", cerradaPorOtro: true } as never);
    expect(await guardarActaAction(acta() as never)).toEqual({
      ok: false,
      error: "El otro técnico ya cerró el acta.",
      reservaAjena: undefined,
      cerradaPorOtro: true,
    });
  });

  it("si otro técnico tiene el acta reservada, devuelve la reserva y no confirma nada", async () => {
    const reserva = { nombre: "Beto", desde: "10:00", liberaEnSeg: 600 };
    vi.mocked(guardarActa).mockResolvedValue({ ok: false, error: "Beto tiene el acta abierta", reservaAjena: reserva } as never);
    const r = await guardarActaAction(acta() as never);
    expect(r.ok).toBe(false);
    expect(r.reservaAjena).toEqual(reserva);
    expect(registrarPersonaLocal).not.toHaveBeenCalled();
    expect(borrarBorrador).not.toHaveBeenCalled();
  });

  it("si falla anotar a la persona o borrar el respaldo, el acta cerrada NO se reporta como error", async () => {
    vi.mocked(registrarPersonaLocal).mockRejectedValue(new Error("deadlock"));
    vi.mocked(borrarBorrador).mockRejectedValue(new Error("deadlock"));
    expect(await guardarActaAction(acta() as never)).toEqual({ ok: true, horaTermino: "15:42" });
  });

  it("un cambio del checklist a mitad del llenado se explica en palabras del técnico", async () => {
    vi.mocked(guardarActa).mockRejectedValue(new Error("The INSERT statement conflicted with the FOREIGN KEY constraint fk_vis_trab_catalogo"));
    const r = await guardarActaAction(acta() as never);
    expect(r.error).toMatch(/El checklist cambió mientras llenabas el acta/);
    expect(r.error).not.toMatch(/FOREIGN KEY/);
  });

  it("cualquier otro fallo de la base es un mensaje genérico sin detalles internos", async () => {
    vi.mocked(guardarActa).mockRejectedValue(new Error("Login failed for user 'dmc_app' on 74.0.0.1"));
    const r = await guardarActaAction(acta() as never);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Revisa la conexión/);
    expect(r.error).not.toMatch(/dmc_app|74\.0\.0\.1/);
  });
});

describe("cambiarEstadoVisitaAction (reagendar / dejar pendiente / cancelar)", () => {
  const pedido = (extra: Record<string, unknown> = {}) =>
    ({ folio: "V-1", estado: "REAGENDADA", motivo: "Local cerrado", fechaNueva: "2026-11-03", horaNueva: null, ...extra }) as never;

  it("reagenda, libera la reserva y refresca", async () => {
    vi.mocked(cambiarEstadoVisita).mockResolvedValue(undefined as never);
    expect(await cambiarEstadoVisitaAction(pedido())).toEqual({ ok: true });
    expect(cambiarEstadoVisita).toHaveBeenCalledWith(
      expect.objectContaining({ folio: "V-1", estado: "REAGENDADA", motivo: "Local cerrado", origen: "MOVIL", tecnicoId: MIO })
    );
    expect(liberarReserva).toHaveBeenCalledWith("V-1", 3);
  });

  it("solo acepta REAGENDADA, PENDIENTE o CANCELADA (no se puede «completar» por acá)", async () => {
    expect((await cambiarEstadoVisitaAction(pedido({ estado: "COMPLETADA" }))).ok).toBe(false);
    expect((await cambiarEstadoVisitaAction(pedido({ estado: "CANCELADA_ADMIN" }))).ok).toBe(false);
    expect(cambiarEstadoVisita).not.toHaveBeenCalled();
  });

  it("un rol del celular sin el permiso «celular.estado» no puede", async () => {
    entrarComo("tecnico", { permisos: ["celular.crearVisita"] });
    const r = await cambiarEstadoVisitaAction(pedido());
    expect(r.error).toMatch(/Tu rol no puede reagendar/);
    expect(cambiarEstadoVisita).not.toHaveBeenCalled();
  });

  it("si el otro técnico tiene el acta abierta, no se cambia nada", async () => {
    vi.mocked(estadoDeReserva).mockResolvedValue({ estado: "ajena", nombre: "Beto", desde: "10:00", liberaEnSeg: 300 } as never);
    const r = await cambiarEstadoVisitaAction(pedido());
    expect(r.ok).toBe(false);
    expect(r.reservaAjena).toMatchObject({ nombre: "Beto" });
    expect(cambiarEstadoVisita).not.toHaveBeenCalled();
  });

  it("el motivo es obligatorio y reagendar exige la nueva fecha", async () => {
    expect((await cambiarEstadoVisitaAction(pedido({ motivo: "   " }))).error).toBe("El motivo es obligatorio.");
    expect((await cambiarEstadoVisitaAction(pedido({ fechaNueva: "" }))).error).toBe("Elige la nueva fecha.");
    expect((await cambiarEstadoVisitaAction(pedido({ fechaNueva: null }))).error).toBe("Elige la nueva fecha.");
    expect(cambiarEstadoVisita).not.toHaveBeenCalled();
  });

  it("dejar pendiente o cancelar no necesita fecha", async () => {
    expect((await cambiarEstadoVisitaAction(pedido({ estado: "PENDIENTE", fechaNueva: null }))).ok).toBe(true);
    expect((await cambiarEstadoVisitaAction(pedido({ estado: "CANCELADA", fechaNueva: null }))).ok).toBe(true);
  });

  it("una fecha con formato inválido se rechaza", async () => {
    expect((await cambiarEstadoVisitaAction(pedido({ fechaNueva: "03/11/2026" }))).ok).toBe(false);
  });

  it("una visita ajena responde que no la encuentra", async () => {
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue(visitaMia({ tecnicoId: 999 }));
    expect((await cambiarEstadoVisitaAction(pedido())).error).toBe("No encontramos esa visita entre las tuyas.");
  });

  it("si la base falla, no libera la reserva ni miente con un ok", async () => {
    vi.mocked(cambiarEstadoVisita).mockRejectedValue(new Error("boom"));
    const r = await cambiarEstadoVisitaAction(pedido());
    expect(r.ok).toBe(false);
    expect(liberarReserva).not.toHaveBeenCalled();
  });
});

describe("crearVisitaTecnicoAction (agregar visita desde el celular)", () => {
  const pedido = (extra: Record<string, unknown> = {}) => ({
    sucursalId: 9,
    motivoCodigo: "VISITA",
    motivosCodigos: ["VISITA"],
    fecha: "2026-10-28",
    hora: null,
    tecnicoAyudanteId: null,
    responsableNombre: "María Soto",
    responsableRut: "11.111.111-1",
    responsableTelefono: "+56911111111",
    trabajo: "Revisar antenas",
    ...extra,
  });

  beforeEach(() => {
    vi.mocked(getSucursal).mockResolvedValue({ id: 9, clienteId: 4 } as never);
    vi.mocked(listarMotivos).mockResolvedValue([
      { codigo: "VISITA", nombre: "Visita preventiva" },
      { codigo: "INSTALACION", nombre: "Instalación de las antenas" },
    ] as never);
    vi.mocked(crearEIniciarVisita).mockResolvedValue({ folio: "V-77" } as never);
  });

  it("crea la visita asignada al técnico, ya iniciada, y devuelve el folio", async () => {
    const r = await crearVisitaTecnicoAction(pedido());
    expect(r).toEqual({ ok: true, folio: "V-77" });
    expect(crearEIniciarVisita).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: 4,
        sucursalId: 9,
        tecnicoId: MIO,
        creadaEnTerreno: true,
        fechaProgramada: "2026-10-28",
        trabajoSolicitado: "Revisar antenas",
      }),
      { tecnicoId: MIO, usuarioId: 3 }
    );
  });

  it("sin texto de trabajo deja uno por defecto que dice que fue en terreno", async () => {
    await crearVisitaTecnicoAction(pedido({ trabajo: "  " }));
    expect(vi.mocked(crearEIniciarVisita).mock.calls[0][0].trabajoSolicitado).toMatch(/fuera de la planificación/);
  });

  it("sin el permiso «celular.crearVisita» no se crea nada", async () => {
    entrarComo("tecnico", { permisos: ["celular.estado"] });
    expect((await crearVisitaTecnicoAction(pedido())).error).toMatch(/no puede agregar visitas/);
    expect(crearEIniciarVisita).not.toHaveBeenCalled();
  });

  it("sin técnico asociado, tampoco", async () => {
    entrarComo("admin");
    expect((await crearVisitaTecnicoAction(pedido())).ok).toBe(false);
  });

  it("una sucursal que no existe, sin motivo o sin fecha, se rechaza", async () => {
    vi.mocked(getSucursal).mockResolvedValue(null as never);
    expect((await crearVisitaTecnicoAction(pedido())).error).toBe("Elige la sucursal donde estás.");
    vi.mocked(getSucursal).mockResolvedValue({ id: 9, clienteId: 4 } as never);
    expect((await crearVisitaTecnicoAction(pedido({ motivoCodigo: "" }))).error).toBe("Marca al menos un motivo de la visita.");
    expect((await crearVisitaTecnicoAction(pedido({ fecha: "" }))).error).toBe("Elige la fecha de la visita.");
    expect(crearEIniciarVisita).not.toHaveBeenCalled();
  });

  it("una instalación exige hora; cualquier otro motivo no", async () => {
    const instalacion = pedido({ motivoCodigo: "INSTALACION", motivosCodigos: ["INSTALACION"] });
    expect((await crearVisitaTecnicoAction(instalacion)).error).toBe("La hora es obligatoria para instalaciones.");
    expect((await crearVisitaTecnicoAction({ ...instalacion, hora: "09:30" })).ok).toBe(true);
    expect((await crearVisitaTecnicoAction(pedido())).ok).toBe(true);
  });

  it("basta una instalación entre varios motivos para exigir la hora", async () => {
    const r = await crearVisitaTecnicoAction(pedido({ motivosCodigos: ["VISITA", "INSTALACION"] }));
    expect(r.error).toBe("La hora es obligatoria para instalaciones.");
  });

  it("el ayudante tiene que ser otro técnico", async () => {
    expect((await crearVisitaTecnicoAction(pedido({ tecnicoAyudanteId: MIO }))).error).toBe("El ayudante tiene que ser otro técnico, no tú.");
    expect((await crearVisitaTecnicoAction(pedido({ tecnicoAyudanteId: 55 }))).ok).toBe(true);
  });

  it("si crear/iniciar devuelve un error de negocio, se muestra; si lanza, es genérico", async () => {
    vi.mocked(crearEIniciarVisita).mockResolvedValueOnce({ error: "Ya tienes otra visita en curso." } as never);
    expect(await crearVisitaTecnicoAction(pedido())).toEqual({ ok: false, error: "Ya tienes otra visita en curso." });
    vi.mocked(crearEIniciarVisita).mockRejectedValueOnce(new Error("boom"));
    expect((await crearVisitaTecnicoAction(pedido())).error).toMatch(/Revisa la conexión/);
  });
});
