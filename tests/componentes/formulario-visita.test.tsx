import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const acciones = vi.hoisted(() => ({
  crearVisitaAction: vi.fn(),
  editarVisitaAction: vi.fn(),
  problemasSinResolverAction: vi.fn(),
  reprogramarVisitaAction: vi.fn(),
  cancelarVisitaAdminAction: vi.fn(),
  eliminarVisitaAction: vi.fn(),
  liberarVisitaAction: vi.fn(),
  personasDelLocalAction: vi.fn(),
}));
vi.mock("@/app/actions/admin", () => acciones);
vi.mock("@/app/actions/personas-local", () => ({ personasDelLocalAction: acciones.personasDelLocalAction }));
vi.mock("@/app/actions/adjuntos", () => ({
  abrirAdjuntoAction: vi.fn(),
  subirTrozoAdjuntoAction: vi.fn(),
  cerrarAdjuntoAction: vi.fn(),
  borrarAdjuntoAction: vi.fn(),
}));
vi.mock("@/app/actions/maestros", () => ({
  guardarClienteAction: vi.fn(),
  guardarMallAction: vi.fn(),
  guardarMarcaAction: vi.fn(),
  guardarSucursalAction: vi.fn(),
}));

import VisitaDialogo, { camposFecha, errorMargen, fechaHastaDe } from "@/components/admin/VisitaDialogos";
import { hoyISO } from "@/lib/ui/fecha";
import { pintar, visitaFalsa } from "../helpers/componentes";

const REF = {
  permisos: ["visitas.ver", "visitas.crear"],
  clientes: [
    { id: 1, nombreFantasia: "Cliente Uno", activo: true },
    { id: 2, nombreFantasia: "Cliente Dos", activo: true },
  ],
  sucursales: [
    { id: 10, clienteId: 1, nombre: "Tienda Centro", activo: true },
    { id: 11, clienteId: 1, nombre: "Tienda Norte", activo: true },
    { id: 20, clienteId: 2, nombre: "Tienda Sur", activo: true },
  ],
  tecnicos: [
    { id: 100, nombreCompleto: "Ana Pérez", activo: true },
    { id: 101, nombreCompleto: "Beto Soto", activo: true },
  ],
  motivos: [
    { codigo: "VISITA", nombre: "Visita preventiva" },
    { codigo: "INSTALACION", nombre: "Instalación de las antenas" },
  ],
  cargos: [],
  malls: [],
};

const onHecho = vi.fn();
const onCerrar = vi.fn();

beforeEach(() => {
  for (const f of Object.values(acciones)) f.mockReset();
  onHecho.mockReset();
  onCerrar.mockReset();
  acciones.problemasSinResolverAction.mockResolvedValue({ ok: true, problemas: [] });
  acciones.personasDelLocalAction.mockResolvedValue([]);
  acciones.crearVisitaAction.mockResolvedValue({ ok: true, folio: "V-9" });
  acciones.editarVisitaAction.mockResolvedValue({ ok: true, folio: "V-1" });
});

function abrir(props: Partial<React.ComponentProps<typeof VisitaDialogo>> = {}, ref: Record<string, unknown> = {}) {
  const u = userEvent.setup();
  const r = pintar(<VisitaDialogo onCerrar={onCerrar} onHecho={onHecho} {...props} />, { ...REF, ...ref } as never);
  return { u, ...r };
}
const dlg = () => within(screen.getByRole("dialog"));

/** Espera a que termine la lectura de problemas de la sucursal (si no, no deja guardar). */
const listoParaGuardar = () => waitFor(() => expect(acciones.problemasSinResolverAction).toHaveBeenCalled());

async function llenarMinimo(u: ReturnType<typeof userEvent.setup>) {
  await u.type(dlg().getByLabelText("Qué se necesita hacer"), "Revisar las antenas del acceso");
  await listoParaGuardar();
}

describe("Nueva visita (panel)", () => {
  it("parte con el primer cliente, su primera sucursal, el primer técnico y motivo, y fecha de hoy", () => {
    abrir();
    expect(dlg().getByRole("combobox", { name: "Cliente" })).toHaveAttribute("placeholder", "Cliente Uno");
    expect(dlg().getByRole("combobox", { name: "Sucursal" })).toHaveAttribute("placeholder", "Tienda Centro");
    expect(dlg().getByRole("combobox", { name: "Técnico asignado" })).toHaveAttribute("placeholder", "Ana Pérez");
    expect(dlg().getByLabelText("Fecha programada")).toHaveValue(hoyISO());
    expect(screen.getByText("Nueva visita")).toBeInTheDocument();
  });

  it("cambiar de cliente cambia las sucursales ofrecidas y elige la primera", async () => {
    const { u } = abrir();
    await u.click(dlg().getByRole("combobox", { name: "Cliente" }));
    await u.click(screen.getByRole("option", { name: "Cliente Dos" }));
    expect(dlg().getByRole("combobox", { name: "Sucursal" })).toHaveAttribute("placeholder", "Tienda Sur");
  });

  it("el ayudante no puede ser el técnico asignado (no aparece en su lista)", async () => {
    const { u } = abrir();
    await u.click(dlg().getByRole("combobox", { name: "Técnico ayudante (opcional)" }));
    const opciones = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opciones.some((t) => t?.includes("Ana Pérez"))).toBe(false);
    expect(opciones.some((t) => t?.includes("Beto Soto"))).toBe(true);
    expect(opciones.some((t) => t?.includes("Sin ayudante"))).toBe(true);
  });

  it("programa la visita: envía los datos normalizados, avisa con el folio y cierra", async () => {
    const { u } = abrir();
    await llenarMinimo(u);
    await u.type(dlg().getByLabelText("Responsable de tienda"), "María Soto");
    await u.click(dlg().getByRole("button", { name: "Programar visita" }));

    await waitFor(() => expect(acciones.crearVisitaAction).toHaveBeenCalledTimes(1));
    expect(acciones.crearVisitaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: 1,
        sucursalId: 10,
        tecnicoId: 100,
        tecnicoAyudanteId: null,
        motivoCodigo: "VISITA",
        motivosCodigos: ["VISITA"],
        fechaProgramada: hoyISO(),
        fechaHasta: null,
        horaProgramada: null,
        trabajoSolicitado: "Revisar las antenas del acceso",
        responsableNombre: "María Soto",
        responsableRut: null,
        avisoProblemas: null,
      })
    );
    await waitFor(() => expect(onHecho).toHaveBeenCalledWith("Visita V-9 programada · Ana Pérez", "V-9"));
    expect(onCerrar).toHaveBeenCalled();
  });

  it("una instalación vuelve la hora obligatoria (y lo dice en la etiqueta)", async () => {
    const { u } = abrir();
    expect(dlg().getByLabelText("Hora de llegada (opcional)")).toBeInTheDocument();
    await u.click(dlg().getByRole("checkbox", { name: /Instalación de las antenas/ }));
    await u.click(dlg().getByRole("checkbox", { name: /Visita preventiva/ }));
    expect(dlg().getByLabelText("Hora de la instalación (obligatoria)")).toBeInTheDocument();

    await llenarMinimo(u);
    await u.click(dlg().getByRole("button", { name: "Programar visita" }));
    expect(onHecho).toHaveBeenCalledWith("En instalación la hora es obligatoria.");
    expect(acciones.crearVisitaAction).not.toHaveBeenCalled();
  });

  it("el primer motivo marcado es el principal; todos viajan en la lista", async () => {
    const { u } = abrir();
    await u.click(dlg().getByRole("checkbox", { name: /Instalación de las antenas/ }));
    await llenarMinimo(u);
    await u.type(dlg().getByLabelText("Hora de la instalación (obligatoria)"), "09:30");
    await u.click(dlg().getByRole("button", { name: "Programar visita" }));
    await waitFor(() => expect(acciones.crearVisitaAction).toHaveBeenCalled());
    const datos = acciones.crearVisitaAction.mock.calls[0][0];
    expect(datos.motivoCodigo).toBe("VISITA");
    expect(datos.motivosCodigos).toEqual(["VISITA", "INSTALACION"]);
    expect(datos.horaProgramada).toBe("09:30");
  });

  it("sin ningún motivo marcado no se guarda", async () => {
    const { u } = abrir();
    await u.click(dlg().getByRole("checkbox", { name: /Visita preventiva/ }));
    await llenarMinimo(u);
    await u.click(dlg().getByRole("button", { name: "Programar visita" }));
    expect(onHecho).toHaveBeenCalledWith("Marca al menos un motivo de la visita.");
    expect(acciones.crearVisitaAction).not.toHaveBeenCalled();
  });

  it("un RUT a medio escribir o con dígito verificador malo no se guarda", async () => {
    const { u } = abrir();
    await llenarMinimo(u);
    await u.type(dlg().getByLabelText("RUT del responsable"), "11.111.111-9");
    await u.click(dlg().getByRole("button", { name: "Programar visita" }));
    expect(onHecho.mock.calls[0][0]).toMatch(/dígito verificador|RUT/);
    expect(acciones.crearVisitaAction).not.toHaveBeenCalled();
  });

  it("el margen de días exige la fecha «hasta» y que sea posterior", async () => {
    const { u } = abrir();
    await llenarMinimo(u);
    await u.click(dlg().getByRole("checkbox", { name: "Margen de días" }));
    await u.click(dlg().getByRole("button", { name: "Programar visita" }));
    expect(onHecho).toHaveBeenCalledWith("Marcaste margen de días: falta la fecha «hasta».");
    expect(acciones.crearVisitaAction).not.toHaveBeenCalled();
  });

  it("si el servidor rechaza, muestra su mensaje y no cierra el diálogo", async () => {
    acciones.crearVisitaAction.mockResolvedValue({ ok: false, error: "El ayudante no puede ser el mismo técnico asignado." });
    const { u } = abrir();
    await llenarMinimo(u);
    await u.click(dlg().getByRole("button", { name: "Programar visita" }));
    await waitFor(() => expect(onHecho).toHaveBeenCalledWith("El ayudante no puede ser el mismo técnico asignado."));
    expect(onCerrar).not.toHaveBeenCalled();
    expect(dlg().getByLabelText("Qué se necesita hacer")).toHaveValue("Revisar las antenas del acceso");
  });
});

describe("aviso de problemas sin resolver al agendar", () => {
  const problemas = [
    { id: 7, tipo: "Antena no detecta", estadoNombre: "Abierto", folio: "V-0003", creadoEn: "2026-10-01T10:00:00", descripcion: "No suena", agendadoEn: null },
    { id: 8, tipo: "Cable dañado", estadoNombre: "Abierto", folio: "V-0004", creadoEn: "2026-10-02T10:00:00", descripcion: null, agendadoEn: null },
  ];

  beforeEach(() => acciones.problemasSinResolverAction.mockResolvedValue({ ok: true, problemas }));

  it("muestra los problemas y pide responder antes de guardar", async () => {
    const { u } = abrir();
    expect(await screen.findByText("Esta sucursal tiene 2 problemas sin resolver")).toBeInTheDocument();
    await u.type(dlg().getByLabelText("Qué se necesita hacer"), "Revisar");
    await u.click(dlg().getByRole("button", { name: "Programar visita" }));
    expect(onHecho).toHaveBeenCalledWith("Esta sucursal tiene problemas sin resolver: responde si la visita es para resolverlos.");
    expect(acciones.crearVisitaAction).not.toHaveBeenCalled();
  });

  it("«Sí, para resolverlos» exige marcar cuáles; con la elección se envía la respuesta", async () => {
    const { u } = abrir();
    await screen.findByText("Esta sucursal tiene 2 problemas sin resolver");
    await u.type(dlg().getByLabelText("Qué se necesita hacer"), "Revisar");
    await u.click(screen.getByRole("radio", { name: "Sí, para resolverlos" }));
    await u.click(dlg().getByRole("button", { name: "Programar visita" }));
    expect(onHecho).toHaveBeenCalledWith("Marca qué problema va a resolver la visita.");

    await u.click(screen.getByRole("checkbox", { name: /Antena no detecta/ }));
    await u.click(dlg().getByRole("button", { name: "Programar visita" }));
    await waitFor(() => expect(acciones.crearVisitaAction).toHaveBeenCalled());
    expect(acciones.crearVisitaAction.mock.calls[0][0].avisoProblemas).toEqual({ respuesta: "RESUELVE", avisados: [7, 8], elegidos: [7] });
  });

  it("«No, es por otra cosa» se guarda sin vincular problemas", async () => {
    const { u } = abrir();
    await screen.findByText("Esta sucursal tiene 2 problemas sin resolver");
    await u.type(dlg().getByLabelText("Qué se necesita hacer"), "Revisar");
    await u.click(screen.getByRole("radio", { name: "No, es por otra cosa" }));
    await u.click(dlg().getByRole("button", { name: "Programar visita" }));
    await waitFor(() => expect(acciones.crearVisitaAction).toHaveBeenCalled());
    expect(acciones.crearVisitaAction.mock.calls[0][0].avisoProblemas).toEqual({ respuesta: "OTRA_COSA", avisados: [7, 8], elegidos: [] });
  });

  it("al corregir una visita ya creada no se vuelve a preguntar", async () => {
    abrir({ visita: visitaFalsa({ folio: "V-1" }) });
    await waitFor(() => expect(acciones.problemasSinResolverAction).not.toHaveBeenCalled());
    expect(screen.queryByText(/problemas sin resolver/)).toBeNull();
  });
});

describe("Editar visita", () => {
  it("abre con los datos de la visita y guarda con editarVisitaAction", async () => {
    const visita = visitaFalsa({
      folio: "V-0042",
      clienteId: 1,
      sucursalId: 11,
      tecnicoId: 101,
      tecnicoAyudanteId: 100,
      fechaProgramada: "2026-11-03",
      horaProgramada: "10:15",
      trabajoSolicitado: "Calibrar antenas",
      responsableNombre: "Pedro",
    });
    const { u } = abrir({ visita });
    expect(screen.getByText("Editar visita V-0042")).toBeInTheDocument();
    expect(dlg().getByRole("combobox", { name: "Sucursal" })).toHaveAttribute("placeholder", "Tienda Norte");
    expect(dlg().getByLabelText("Fecha programada")).toHaveValue("2026-11-03");
    expect(dlg().getByLabelText("Qué se necesita hacer")).toHaveValue("Calibrar antenas");

    await u.click(dlg().getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(acciones.editarVisitaAction).toHaveBeenCalledTimes(1));
    expect(acciones.editarVisitaAction).toHaveBeenCalledWith(
      "V-0042",
      expect.objectContaining({ sucursalId: 11, tecnicoId: 101, tecnicoAyudanteId: 100, fechaProgramada: "2026-11-03", horaProgramada: "10:15", avisoProblemas: null })
    );
    expect(acciones.crearVisitaAction).not.toHaveBeenCalled();
  });

  it("una visita con margen de días abre con la casilla marcada y sus dos fechas", () => {
    abrir({ visita: visitaFalsa({ fechaProgramada: "2026-11-02", fechaHasta: "2026-11-06" }) });
    expect(dlg().getByLabelText("Desde")).toHaveValue("2026-11-02");
    expect(dlg().getByLabelText("Hasta")).toHaveValue("2026-11-06");
  });
});

describe("helpers del formulario de visita", () => {
  it("camposFecha: un campo sin margen, dos con margen", () => {
    expect(camposFecha({ margen: false }).map((c) => c.k)).toEqual(["fecha"]);
    expect(camposFecha({ margen: true }).map((c) => c.k)).toEqual(["fecha", "fechaHasta"]);
  });

  it("errorMargen valida solo cuando se usa", () => {
    expect(errorMargen({ margen: false })).toBeNull();
    expect(errorMargen({ margen: true, fecha: "2026-11-02", fechaHasta: "" })).toMatch(/falta la fecha «hasta»/);
    expect(errorMargen({ margen: true, fecha: "2026-11-02", fechaHasta: "2026-11-02" })).toMatch(/posterior/);
    expect(errorMargen({ margen: true, fecha: "2026-11-02", fechaHasta: "2026-11-05" })).toBeNull();
  });

  it("fechaHastaDe: nada si la casilla no está marcada", () => {
    expect(fechaHastaDe({ margen: false, fechaHasta: "2026-11-05" })).toBeNull();
    expect(fechaHastaDe({ margen: true, fechaHasta: "2026-11-05" })).toBe("2026-11-05");
    expect(fechaHastaDe({ margen: true, fechaHasta: "" })).toBeNull();
  });
});
