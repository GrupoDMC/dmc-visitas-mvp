import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const acciones = vi.hoisted(() => ({
  guardarActaAction: vi.fn(),
  guardarBorradorAction: vi.fn(),
  renovarReservaAction: vi.fn(),
  liberarReservaAction: vi.fn(),
  editarActaTecnicoAction: vi.fn(),
  personasDelLocalAction: vi.fn(),
}));
vi.mock("@/app/actions/visitas", () => ({ guardarActaAction: acciones.guardarActaAction }));
vi.mock("@/app/actions/borradores", () => ({ guardarBorradorAction: acciones.guardarBorradorAction }));
vi.mock("@/app/actions/reservas", () => ({
  renovarReservaAction: acciones.renovarReservaAction,
  liberarReservaAction: acciones.liberarReservaAction,
}));
vi.mock("@/app/actions/ediciones", () => ({ editarActaTecnicoAction: acciones.editarActaTecnicoAction }));
vi.mock("@/app/actions/personas-local", () => ({ personasDelLocalAction: acciones.personasDelLocalAction }));
vi.mock("@/app/actions/videos", () => ({
  abrirVideoAction: vi.fn(),
  subirTrozoVideoAction: vi.fn(),
  cerrarVideoAction: vi.fn(),
  borrarVideoAction: vi.fn(),
}));

import FormularioVisita from "@/components/mobile/FormularioVisita";
import { ReferenciasProvider, REFERENCIAS_VACIAS } from "@/lib/ui/referencias";
import { UsuarioLocalProvider } from "@/lib/ui/usuario-local";
import { escribirBorrador, leerActaEnCola, leerBorrador, type BorradorActa } from "@/lib/ui/borrador";
import { router, visitaFalsa } from "../helpers/componentes";

const UID = 3;
const MOTIVOS = [
  { codigo: "VISITA", nombre: "Visita preventiva" },
  { codigo: "CALIBRACION", nombre: "Calibración de las antenas" },
];
const TRABAJOS = [
  { codigo: "REVISION_ANTENAS", nombre: "Revisión de antenas", motivosCodigos: ["VISITA"], ordenEnMotivo: { VISITA: 1 }, orden: 1, subtrabajos: [] },
];

const visita = visitaFalsa({
  folio: "V-0500",
  estado: "EN_CURSO",
  responsableNombre: "María Soto",
  sucursal: { id: 1, nombre: "Tienda Centro" },
  sucursalId: 1,
  ejecucion: { motivosRealesCodigos: [], horaInicio: "2026-10-28T10:00:00" },
});

/** Un borrador completo (con firma): la forma más corta de llegar a «Guardar visita» sin dibujar. */
const borradorCompleto = (extra: Partial<BorradorActa> = {}): BorradorActa => ({
  folio: "V-0500",
  guardadoEn: new Date().toISOString(),
  respNombre: "María Soto",
  respRut: "11.111.111-1",
  respTel: "+56 9 1111 1111",
  motivosCodigos: ["VISITA"],
  obs: "Todo en orden",
  interno: "",
  internos: [],
  trabajos: [{ id: 1, codigo: "REVISION_ANTENAS", motivo: "VISITA", subs: [], detalle: "" }],
  problemas: [],
  fotos: [],
  firma: { imagen: "data:image/png;base64,AAAA", nombre: "María Soto", rut: "11.111.111-1", hora: "11:20" },
  guardadas: { sucursal: true, motivo: true },
  horaInicio: "10:00",
  ...extra,
});

function pintarActa(props: Partial<React.ComponentProps<typeof FormularioVisita>> = {}, permisos = ["celular.video", "celular.estado"]) {
  const u = userEvent.setup();
  const r = render(
    <ReferenciasProvider valor={{ ...REFERENCIAS_VACIAS, permisos, motivos: MOTIVOS as never }}>
      <UsuarioLocalProvider usuarioId={UID}>
        <FormularioVisita
          visita={visita}
          motivos={MOTIVOS as never}
          catalogoTrabajo={TRABAJOS as never}
          catalogoProblema={[]}
          catalogoInterno={[]}
          {...props}
        />
      </UsuarioLocalProvider>
    </ReferenciasProvider>
  );
  return { u, ...r };
}

beforeEach(() => {
  localStorage.clear();
  for (const f of Object.values(acciones)) f.mockReset();
  acciones.renovarReservaAction.mockResolvedValue({ ok: true });
  acciones.liberarReservaAction.mockResolvedValue({ ok: true });
  acciones.guardarBorradorAction.mockResolvedValue({ ok: true });
  acciones.personasDelLocalAction.mockResolvedValue([]);
  acciones.guardarActaAction.mockResolvedValue({ ok: true, horaTermino: "11:22" });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

/** Deja el borrador en el celular y abre el formulario: se recupera tal cual. */
async function conBorrador(b: BorradorActa) {
  escribirBorrador(UID, b);
  const ctx = pintarActa();
  await screen.findByText(/quedó a medias/);
  return ctx;
}

describe("acta del técnico (celular)", () => {
  it("muestra el folio, la tienda y las seis secciones", () => {
    pintarActa();
    expect(screen.getByText(/V-0500/)).toBeInTheDocument();
    for (const seccion of ["responsable", "trabajo", "problemas", "interno", "fotos", "firma"]) {
      expect(screen.getAllByText(new RegExp(seccion, "i")).length, seccion).toBeGreaterThan(0);
    }
    expect(screen.getByRole("button", { name: /Revisar y guardar/ })).toBeInTheDocument();
  });

  it("parte con el responsable que se anotó al agendar", () => {
    pintarActa();
    expect(screen.getByDisplayValue("María Soto")).toBeInTheDocument();
  });

  it("«Revisar y guardar» con la sección del responsable incompleta avisa qué falta y no avanza", async () => {
    const { u } = pintarActa();
    await u.click(screen.getByRole("button", { name: /Revisar y guardar/ }));
    expect(await screen.findByText("El RUT del responsable está incompleto")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar visita" })).toBeNull();
  });

  it("lo escrito se guarda solo en el celular (borrador por usuario) sin llamar al servidor de actas", async () => {
    const { u } = pintarActa();
    const campo = screen.getByDisplayValue("María Soto");
    await u.clear(campo);
    await u.type(campo, "Pedro Rojas");
    await waitFor(() => expect(leerBorrador(UID, "V-0500")?.respNombre).toBe("Pedro Rojas"), { timeout: 3000 });
    expect(acciones.guardarActaAction).not.toHaveBeenCalled();
    // Otro usuario del mismo equipo no ve ese borrador.
    expect(leerBorrador(99, "V-0500")).toBeNull();
  });

  it("recupera un acta que quedó a medias y lo dice", async () => {
    await conBorrador(borradorCompleto({ respNombre: "Recuperada Ana", firma: null }));
    expect(screen.getByDisplayValue("Recuperada Ana")).toBeInTheDocument();
  });
});

describe("guardar la visita", () => {
  async function hastaRevision() {
    const ctx = await conBorrador(borradorCompleto());
    await ctx.u.click(screen.getByRole("button", { name: /Revisar y guardar/ }));
    await screen.findByRole("button", { name: "Guardar visita" });
    return ctx;
  }

  it("con todo completo, revisa el acta y la envía al servidor con todos sus datos", async () => {
    const { u } = await hastaRevision();
    await u.click(screen.getByRole("button", { name: "Guardar visita" }));

    await waitFor(() => expect(acciones.guardarActaAction).toHaveBeenCalledTimes(1));
    const entrada = acciones.guardarActaAction.mock.calls[0][0];
    expect(entrada).toMatchObject({
      folio: "V-0500",
      responsableNombre: "María Soto",
      responsableRut: "11.111.111-1",
      motivosCodigos: ["VISITA"],
      observaciones: "Todo en orden",
      trabajos: [{ codigo: "REVISION_ANTENAS", motivoCodigo: "VISITA", detalle: null, subtrabajos: [] }],
      problemas: [],
      registradoOffline: false,
      firma: { nombre: "María Soto", rut: "11.111.111-1", dataUrl: "data:image/png;base64,AAAA" },
    });
    expect(entrada.capturadaEn).toBeTruthy();
    expect(await screen.findByRole("heading", { name: /Visita\s*guardada/ })).toBeInTheDocument();
    expect(screen.getByText(/11:22/)).toBeInTheDocument();
  });

  it("al terminar bien borra el borrador y no deja nada en cola", async () => {
    const { u } = await hastaRevision();
    await u.click(screen.getByRole("button", { name: "Guardar visita" }));
    await screen.findByRole("heading", { name: /Visita\s*guardada/ });
    expect(leerBorrador(UID, "V-0500")).toBeNull();
    expect(leerActaEnCola(UID, "V-0500")).toBeNull();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("sin firma no se puede guardar", async () => {
    const ctx = await conBorrador(borradorCompleto({ firma: null }));
    await ctx.u.click(screen.getByRole("button", { name: /Revisar y guardar/ }));
    await screen.findByRole("button", { name: "Guardar visita" });
    expect(screen.getByText(/Falta .*firma/i)).toBeInTheDocument();
    await ctx.u.click(screen.getByRole("button", { name: "Guardar visita" }));
    expect(acciones.guardarActaAction).not.toHaveBeenCalled();
  });

  it("si el servidor la rechaza, vuelve a la revisión con el motivo y NO la encola", async () => {
    acciones.guardarActaAction.mockResolvedValue({ ok: false, error: "El checklist cambió mientras llenabas el acta." });
    const { u } = await hastaRevision();
    await u.click(screen.getByRole("button", { name: "Guardar visita" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El checklist cambió mientras llenabas el acta.");
    expect(leerActaEnCola(UID, "V-0500")).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar visita" })).toBeInTheDocument();
  });

  it("sin señal (la llamada falla) el acta queda guardada en el celular para enviarse sola", async () => {
    acciones.guardarActaAction.mockRejectedValue(new Error("Failed to fetch"));
    const { u } = await hastaRevision();
    await u.click(screen.getByRole("button", { name: "Guardar visita" }));

    await waitFor(() => expect(leerActaEnCola(UID, "V-0500")).not.toBeNull());
    const enCola = leerActaEnCola(UID, "V-0500")!;
    expect(enCola.entrada.responsableNombre).toBe("María Soto");
    expect(enCola.intentos).toBe(1);
    expect(await screen.findByText(/sin enviar|esperando|señal/i)).toBeInTheDocument();
  });

  it("con el celular ya sin conexión marca el envío como registrado offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    acciones.guardarActaAction.mockRejectedValue(new Error("offline"));
    const { u } = await hastaRevision();
    await u.click(screen.getByRole("button", { name: "Guardar visita" }));
    await waitFor(() => expect(acciones.guardarActaAction).toHaveBeenCalled());
    expect(acciones.guardarActaAction.mock.calls[0][0].registradoOffline).toBe(true);
  });

  it("si el otro técnico tiene el acta reservada, bloquea el formulario y conserva lo escrito", async () => {
    acciones.guardarActaAction.mockResolvedValue({
      ok: false,
      error: "Beto tiene el acta abierta.",
      reservaAjena: { nombre: "Beto Soto", desde: "10:00", liberaEnSeg: 600 },
    });
    const { u } = await hastaRevision();
    await u.click(screen.getByRole("button", { name: "Guardar visita" }));
    expect(await screen.findByText(/Beto Soto/)).toBeInTheDocument();
    expect(leerBorrador(UID, "V-0500")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: /Visita\s*guardada/ })).toBeNull();
  });

  it("si el otro técnico ya cerró el acta, la del celular se conserva en cola sin enviarse", async () => {
    acciones.guardarActaAction.mockResolvedValue({ ok: false, error: "El otro técnico ya cerró el acta.", cerradaPorOtro: true });
    const { u } = await hastaRevision();
    await u.click(screen.getByRole("button", { name: "Guardar visita" }));
    await waitFor(() => expect(leerActaEnCola(UID, "V-0500")).not.toBeNull());
    expect(screen.queryByRole("heading", { name: /Visita\s*guardada/ })).toBeNull();
  });

  it("«Volver a corregir» regresa al formulario sin enviar nada", async () => {
    const { u } = await hastaRevision();
    await u.click(screen.getByRole("button", { name: "Volver a corregir" }));
    expect(await screen.findByRole("button", { name: /Revisar y guardar/ })).toBeInTheDocument();
    expect(acciones.guardarActaAction).not.toHaveBeenCalled();
  });
});

describe("problemas que la visita venía a resolver", () => {
  const porResolver = [{ id: 7, tipo: "Antena no detecta", estadoNombre: "Agendado", folio: "V-0003", creadoEn: "2026-10-01T10:00:00", descripcion: null, agendadoEn: null }];

  it("hay que responder cada uno antes de poder revisar el acta", async () => {
    escribirBorrador(UID, borradorCompleto());
    const u = userEvent.setup();
    pintarActa({ porResolver: porResolver as never });
    await screen.findByText(/quedó a medias/);
    await u.click(screen.getByRole("button", { name: /Revisar y guardar/ }));
    expect(await screen.findByText(/Responde si quedó solucionado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar visita" })).toBeNull();
  });
});
