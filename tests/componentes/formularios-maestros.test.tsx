import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const acciones = vi.hoisted(() => ({
  guardarClienteAction: vi.fn(),
  guardarMallAction: vi.fn(),
  guardarMarcaAction: vi.fn(),
  guardarSucursalAction: vi.fn(),
  crearSucursalesLoteAction: vi.fn(),
  guardarTiendasMallAction: vi.fn(),
}));
vi.mock("@/app/actions/maestros", () => acciones);

import ClientesTable from "@/components/admin/maestros/ClientesTable";
import MallsTable from "@/components/admin/maestros/MallsTable";
import SucursalesTable from "@/components/admin/maestros/SucursalesTable";
import SucursalesLoteDialogo from "@/components/admin/maestros/SucursalesLoteDialogo";
import { pintar, router } from "../helpers/componentes";

const cliente = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  rut: "76.123.456-0",
  razonSocial: "Empresa Uno SpA",
  nombreFantasia: "Uno",
  activo: true,
  motivoInactivo: null,
  notas: null,
  planCalibracion: null,
  garantiaMeses: null,
  ...extra,
});

const mall = (extra: Record<string, unknown> = {}) => ({
  id: 5,
  nombre: "Mall Plaza Norte",
  direccion: "Av. Américo Vespucio 1737",
  comuna: "Huechuraba",
  region: "Metropolitana",
  activo: true,
  ...extra,
});

const sucursal = (extra: Record<string, unknown> = {}) => ({
  id: 10,
  clienteId: 1,
  marcaId: 2,
  mallId: null,
  nombre: "Tienda Centro",
  codigo: "T-01",
  direccion: "Av. Principal 100",
  comuna: "Santiago",
  region: "Metropolitana",
  telefono: null,
  activo: true,
  motivoInactivo: null,
  notas: null,
  fechaInstalacion: null,
  remota: null,
  garantiaMeses: null,
  planCalibracion: null,
  ...extra,
});

const MARCAS = [
  { id: 2, clienteId: 1, nombre: "Marca Uno", activo: true },
  { id: 3, clienteId: 2, nombre: "Marca Dos", activo: true },
];

const PERMISOS = (modulo: string) => [`${modulo}.ver`, `${modulo}.crear`, `${modulo}.editar`];

beforeEach(() => {
  for (const f of Object.values(acciones)) f.mockReset();
  acciones.guardarClienteAction.mockResolvedValue({ ok: true, id: 1 });
  acciones.guardarMallAction.mockResolvedValue({ ok: true, id: 1 });
  acciones.guardarSucursalAction.mockResolvedValue({ ok: true, id: 1 });
  acciones.crearSucursalesLoteAction.mockResolvedValue({ ok: true, creadas: 1 });
});

const dialogo = () => screen.getByRole("dialog");
const escribir = async (u: ReturnType<typeof userEvent.setup>, etiqueta: string | RegExp, texto: string) => {
  const campo = within(dialogo()).getByLabelText(etiqueta);
  await escribirEn(u, campo, texto);
};
const escribirEn = async (u: ReturnType<typeof userEvent.setup>, campo: HTMLElement, texto: string) => {
  await u.clear(campo);
  if (texto) await u.type(campo, texto);
};
const aviso = () => screen.getByRole("status").textContent;

describe("formulario de cliente", () => {
  const abrir = async (permisos = PERMISOS("clientes"), clientes = [cliente()]) => {
    const u = userEvent.setup();
    pintar(<ClientesTable clientes={clientes as never} sucursales={[]} />, { permisos });
    await u.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    return u;
  };

  it("sin permiso de crear no hay botón de alta; sin el de editar no hay lápiz", () => {
    pintar(<ClientesTable clientes={[cliente()] as never} sucursales={[]} />, { permisos: ["clientes.ver"] });
    expect(screen.queryByRole("button", { name: "Nuevo cliente" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar cliente/ })).toBeNull();
  });

  it("crea un cliente con los datos recortados y refresca la lista", async () => {
    const u = await abrir();
    await escribir(u, "Razón social", "  Empresa Nueva SpA ");
    await escribir(u, "RUT", "76.543.210-3");
    await u.click(within(dialogo()).getByRole("button", { name: "Crear cliente" }));
    await waitFor(() => expect(acciones.guardarClienteAction).toHaveBeenCalledTimes(1));
    expect(acciones.guardarClienteAction).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        razonSocial: "Empresa Nueva SpA",
        nombreFantasia: "Empresa Nueva SpA",
        rut: expect.stringMatching(/76\.?543\.?210-?3/),
        activo: true,
        motivoInactivo: null,
      })
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("razón social y RUT son obligatorios (no llama al servidor)", async () => {
    const u = await abrir();
    await u.click(within(dialogo()).getByRole("button", { name: "Crear cliente" }));
    expect(aviso()).toBe("Razón social y RUT son obligatorios");
    expect(acciones.guardarClienteAction).not.toHaveBeenCalled();
  });

  it("rechaza un RUT con dígito verificador incorrecto", async () => {
    const u = await abrir();
    await escribir(u, "Razón social", "Empresa Nueva");
    await escribir(u, "RUT", "76.543.210-9");
    await u.click(within(dialogo()).getByRole("button", { name: "Crear cliente" }));
    expect(aviso()).toMatch(/dígito verificador/);
    expect(acciones.guardarClienteAction).not.toHaveBeenCalled();
  });

  it("avisa si el RUT ya es de otra empresa", async () => {
    const u = await abrir(PERMISOS("clientes"), [cliente({ rut: "76.543.210-3", nombreFantasia: "Existente" })]);
    await escribir(u, "Razón social", "Otra Empresa");
    await escribir(u, "RUT", "76.543.210-3");
    await u.click(within(dialogo()).getByRole("button", { name: "Crear cliente" }));
    expect(aviso()).toMatch(/Ese RUT ya es de «Existente»/);
    expect(acciones.guardarClienteAction).not.toHaveBeenCalled();
  });

  it("la garantía va en meses, entre 1 y 240", async () => {
    const u = await abrir();
    await escribir(u, "Razón social", "Empresa Nueva");
    await escribir(u, "RUT", "76.543.210-3");
    await escribir(u, /Plan de garantía/, "500");
    await u.click(within(dialogo()).getByRole("button", { name: "Crear cliente" }));
    expect(aviso()).toBe("La garantía va en meses, entre 1 y 240");
  });

  it("al editar, desactivar exige explicar por qué", async () => {
    const u = userEvent.setup();
    pintar(<ClientesTable clientes={[cliente()] as never} sucursales={[]} />, { permisos: PERMISOS("clientes") });
    await u.click(screen.getByRole("button", { name: "Editar clientes" }));
    expect(within(dialogo()).queryByLabelText("¿Por qué se desactiva?")).toBeNull();
    await u.click(within(dialogo()).getByRole("button", { name: "Inactivo" }));
    expect(await within(dialogo()).findByLabelText("¿Por qué se desactiva?")).toBeInTheDocument();
    await u.click(within(dialogo()).getByRole("button", { name: "Guardar cambios" }));
    expect(aviso()).toBe("Explica por qué se desactiva el cliente");
    expect(acciones.guardarClienteAction).not.toHaveBeenCalled();
  });

  it("si el servidor rechaza, muestra su mensaje y deja el diálogo abierto con lo escrito", async () => {
    acciones.guardarClienteAction.mockResolvedValue({ ok: false, error: "El RUT ya está registrado en otra empresa." });
    const u = await abrir();
    await escribir(u, "Razón social", "Empresa Nueva");
    await escribir(u, "RUT", "76.543.210-3");
    await u.click(within(dialogo()).getByRole("button", { name: "Crear cliente" }));
    await waitFor(() => expect(aviso()).toBe("El RUT ya está registrado en otra empresa."));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialogo()).getByLabelText("Razón social")).toHaveValue("Empresa Nueva");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("la búsqueda filtra la lista sin importar tildes", async () => {
    const u = userEvent.setup();
    pintar(<ClientesTable clientes={[cliente({ id: 1, nombreFantasia: "Égalo" }), cliente({ id: 2, nombreFantasia: "Otro", rut: "1-9" })] as never} sucursales={[]} />, {
      permisos: ["clientes.ver"],
    });
    await u.type(screen.getByLabelText("Buscar cliente o RUT…"), "egalo");
    expect(screen.getByText("Égalo")).toBeInTheDocument();
    expect(screen.queryByText("Otro")).toBeNull();
    expect(screen.getByText("1 registro")).toBeInTheDocument();
  });
});

describe("formulario de mall", () => {
  const abrir = async (malls = [mall()]) => {
    const u = userEvent.setup();
    pintar(<MallsTable malls={malls as never} sucursales={[]} clientes={[]} />, { permisos: PERMISOS("malls") });
    await u.click(screen.getByRole("button", { name: /Nuevo mall/ }));
    return u;
  };

  it("crea un mall con nombre, dirección, comuna y región", async () => {
    const u = await abrir();
    await escribir(u, "Nombre del mall", "Mall Nuevo");
    await escribir(u, "Dirección", "Av. Siempre Viva 742");
    await escribir(u, "Comuna", "Maipú");
    await u.click(within(dialogo()).getByRole("button", { name: /Crear mall/ }));
    await waitFor(() => expect(acciones.guardarMallAction).toHaveBeenCalledTimes(1));
    expect(acciones.guardarMallAction).toHaveBeenCalledWith(null, {
      nombre: "Mall Nuevo",
      direccion: "Av. Siempre Viva 742",
      comuna: "Maipú",
      region: "Arica y Parinacota",
      activo: true,
    });
  });

  it("nombre, dirección y comuna son obligatorios", async () => {
    const u = await abrir();
    await escribir(u, "Nombre del mall", "Mall Nuevo");
    await u.click(within(dialogo()).getByRole("button", { name: /Crear mall/ }));
    expect(aviso()).toBe("Nombre, dirección y comuna son obligatorios");
    expect(acciones.guardarMallAction).not.toHaveBeenCalled();
  });

  it("si la dirección ya existe en otro mall, pide confirmar antes de guardar", async () => {
    const u = await abrir();
    await escribir(u, "Nombre del mall", "Mall Duplicado");
    await escribir(u, "Dirección", "AV. AMERICO VESPUCIO, 1737");
    await escribir(u, "Comuna", "huechuraba");
    await u.click(within(dialogo()).getByRole("button", { name: /Crear mall/ }));
    expect(acciones.guardarMallAction).not.toHaveBeenCalled();
    expect(await screen.findByText(/El mall «Mall Plaza Norte» ya está en/)).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Guardar de todas formas" }));
    await waitFor(() => expect(acciones.guardarMallAction).toHaveBeenCalledTimes(1));
  });

  it("editar un mall no dispara el aviso de dirección repetida (es el mismo)", async () => {
    const u = userEvent.setup();
    pintar(<MallsTable malls={[mall()] as never} sucursales={[]} clientes={[]} />, { permisos: PERMISOS("malls") });
    await u.click(screen.getByRole("button", { name: /Editar mall/i }));
    await u.click(within(dialogo()).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(acciones.guardarMallAction).toHaveBeenCalledWith(5, expect.objectContaining({ nombre: "Mall Plaza Norte" })));
  });
});

describe("formulario de sucursal", () => {
  const props = {
    clientes: [cliente(), cliente({ id: 2, nombreFantasia: "Dos", rut: "76.000.000-0" })],
    malls: [mall()],
  };
  const abrir = async (sucursales = [sucursal()], permisos = PERMISOS("sucursales")) => {
    const u = userEvent.setup();
    pintar(<SucursalesTable sucursales={sucursales as never} clientes={props.clientes as never} malls={props.malls as never} />, {
      permisos,
      marcas: MARCAS as never,
    });
    await u.click(screen.getByRole("button", { name: /Nueva sucursal/ }));
    return u;
  };

  it("nombre y cliente son obligatorios; sin mall exige la dirección de calle", async () => {
    const u = await abrir();
    await u.click(within(dialogo()).getByRole("button", { name: /Crear sucursal/ }));
    expect(aviso()).toBe("Nombre y cliente son obligatorios");
    expect(acciones.guardarSucursalAction).not.toHaveBeenCalled();
  });

  it("una sucursal sin mall y sin dirección no se guarda", async () => {
    const u = await abrir();
    await escribir(u, "Nombre de la sucursal", "Tienda Nueva");
    await u.click(within(dialogo()).getByLabelText("Cliente"));
    await u.click(await screen.findByRole("option", { name: "Uno" }));
    await u.click(within(dialogo()).getByRole("button", { name: /Crear sucursal/ }));
    expect(aviso()).toMatch(/Sin mall, la sucursal necesita su dirección de calle|Elige la marca/);
    expect(acciones.guardarSucursalAction).not.toHaveBeenCalled();
  });

  it("elegir un mall le pone nombre, dirección, comuna y región a la sucursal nueva", async () => {
    const u = await abrir();
    await u.click(within(dialogo()).getByLabelText("Mall (opcional)"));
    await u.click(await screen.findByRole("option", { name: "Mall Plaza Norte" }));
    expect(within(dialogo()).getByLabelText("Nombre de la sucursal")).toHaveValue("Mall Plaza Norte");
    expect(within(dialogo()).getByLabelText("Dirección")).toHaveValue("Av. Américo Vespucio 1737");
    expect(within(dialogo()).getByLabelText("Comuna")).toHaveValue("Huechuraba");
  });

  it("al crear, si el cliente ya tiene un local en esa dirección, avisa antes de guardar", async () => {
    const u = await abrir([sucursal({ nombre: "Tienda Centro", direccion: "Av. Principal 100", comuna: "Santiago" })]);
    await u.click(within(dialogo()).getByLabelText("Cliente"));
    await u.click(await screen.findByRole("option", { name: "Uno" }));
    await escribir(u, "Nombre de la sucursal", "Otra Tienda");
    await escribir(u, "Dirección", "AV principal 100");
    await escribir(u, "Comuna", "Santiago");
    await u.click(within(dialogo()).getByRole("button", { name: /Crear sucursal/ }));
    expect(await screen.findByText(/El cliente ya tiene la sucursal «Tienda Centro»/)).toBeInTheDocument();
    expect(acciones.guardarSucursalAction).not.toHaveBeenCalled();
  });
});

describe("carga masiva de sucursales", () => {
  const clientes = [cliente(), cliente({ id: 2, nombreFantasia: "Dos", rut: "76.000.000-0" })];
  const existentes = [sucursal({ nombre: "Tienda Centro", codigo: "T-01", direccion: "Calle Vieja 1", comuna: "Santiago" })];
  const alCerrar = vi.fn();
  const alHacer = vi.fn();

  const abrir = () => {
    const u = userEvent.setup();
    pintar(
      <SucursalesLoteDialogo
        sucursales={existentes as never}
        clientes={clientes as never}
        malls={[mall()] as never}
        clienteInicial="1"
        onCerrar={alCerrar}
        onHecho={alHacer}
      />,
      { marcas: MARCAS as never }
    );
    return u;
  };

  /** Rellena la primera tarjeta con lo mínimo para que sea válida. */
  async function llenar(u: ReturnType<typeof userEvent.setup>, n: number, datos: { nombre: string; direccion: string; comuna: string; codigo?: string }) {
    const d = within(dialogo());
    const campos = d.getAllByLabelText("Nombre de la sucursal");
    await escribirEn(u, campos[n], datos.nombre);
    const dir = d.getAllByLabelText("Dirección");
    await escribirEn(u, dir[n], datos.direccion);
    const com = d.getAllByLabelText("Comuna");
    await escribirEn(u, com[n], datos.comuna);
    if (datos.codigo) {
      const cod = d.getAllByLabelText("Código interno (opcional)");
      await escribirEn(u, cod[n], datos.codigo);
    }
  }

  beforeEach(() => {
    alCerrar.mockReset();
    alHacer.mockReset();
  });

  it("parte con el cliente elegido y su primera marca, y avisa cuántas sucursales ya tiene", () => {
    abrir();
    expect(screen.getByText("Ya tiene 1 sucursal: no se pueden repetir nombres ni códigos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear sucursal" })).toBeInTheDocument();
  });

  it("«Agregar otra sucursal» suma tarjetas y el botón cuenta cuántas se crearán", async () => {
    const u = abrir();
    await u.click(screen.getByRole("button", { name: /Agregar otra sucursal/ }));
    expect(screen.getByRole("button", { name: "Crear 2 sucursales" })).toBeInTheDocument();
    expect(within(dialogo()).getAllByLabelText("Nombre de la sucursal")).toHaveLength(2);
  });

  it("crea todas juntas en una sola llamada y cierra", async () => {
    acciones.crearSucursalesLoteAction.mockResolvedValue({ ok: true, creadas: 2 });
    const u = abrir();
    await u.click(screen.getByRole("button", { name: /Agregar otra sucursal/ }));
    await llenar(u, 0, { nombre: "Tienda A", direccion: "Calle A 1", comuna: "Santiago", codigo: "A-1" });
    await llenar(u, 1, { nombre: "Tienda B", direccion: "Calle B 2", comuna: "Maipú" });
    await u.click(within(dialogo()).getByRole("button", { name: "Crear 2 sucursales" }));
    await waitFor(() => expect(acciones.crearSucursalesLoteAction).toHaveBeenCalledTimes(1));
    expect(acciones.crearSucursalesLoteAction).toHaveBeenCalledWith(1, 2, [
      { mallId: null, nombre: "Tienda A", codigo: "A-1", direccion: "Calle A 1", comuna: "Santiago", region: "Arica y Parinacota" },
      { mallId: null, nombre: "Tienda B", codigo: null, direccion: "Calle B 2", comuna: "Maipú", region: "Arica y Parinacota" },
    ]);
    await waitFor(() => expect(alHacer).toHaveBeenCalledWith("2 sucursales creadas", true));
    expect(alCerrar).toHaveBeenCalled();
  });

  it.each([
    ["sin nombre", { nombre: "", direccion: "Calle 1", comuna: "X" }, "Sucursal 1: falta el nombre."],
    ["sin dirección", { nombre: "T", direccion: "", comuna: "X" }, "Sucursal 1: faltan la dirección o la comuna."],
    ["con el nombre de una que ya existe", { nombre: "tienda CENTRO", direccion: "Calle 1", comuna: "X" }, "Sucursal 1: el cliente ya tiene (o repites) «tienda CENTRO»."],
    ["con un código que ya existe", { nombre: "Nueva", direccion: "Calle 1", comuna: "X", codigo: "t-01" }, "Sucursal 1: el código t-01 ya existe (o está repetido)."],
  ])("no guarda una sucursal %s", async (_n, datos, mensaje) => {
    const u = abrir();
    await llenar(u, 0, datos);
    await u.click(within(dialogo()).getByRole("button", { name: "Crear sucursal" }));
    expect(alHacer).toHaveBeenCalledWith(mensaje, false);
    expect(acciones.crearSucursalesLoteAction).not.toHaveBeenCalled();
  });

  it("detecta nombres repetidos dentro de la misma carga", async () => {
    const u = abrir();
    await u.click(screen.getByRole("button", { name: /Agregar otra sucursal/ }));
    await llenar(u, 0, { nombre: "Igual", direccion: "Calle 1", comuna: "X" });
    await llenar(u, 1, { nombre: "igual", direccion: "Calle 2", comuna: "X" });
    await u.click(within(dialogo()).getByRole("button", { name: "Crear 2 sucursales" }));
    expect(alHacer).toHaveBeenCalledWith("Sucursal 2: el cliente ya tiene (o repites) «igual».", false);
  });

  it("si una dirección ya existe pide confirmación; al confirmar guarda", async () => {
    const u = abrir();
    await llenar(u, 0, { nombre: "Tienda Nueva", direccion: "calle vieja, 1", comuna: "santiago" });
    await u.click(within(dialogo()).getByRole("button", { name: "Crear sucursal" }));
    expect(acciones.crearSucursalesLoteAction).not.toHaveBeenCalled();
    expect(await screen.findByText(/«Tienda Centro» ya está en «Calle Vieja 1»/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Crear de todas formas" }));
    await waitFor(() => expect(acciones.crearSucursalesLoteAction).toHaveBeenCalledTimes(1));
  });

  it("si el servidor falla, avisa con su mensaje y no cierra", async () => {
    acciones.crearSucursalesLoteAction.mockResolvedValue({ ok: false, error: "Ya existe una sucursal con ese código." });
    const u = abrir();
    await llenar(u, 0, { nombre: "Tienda Nueva", direccion: "Calle 9", comuna: "Maipú" });
    await u.click(within(dialogo()).getByRole("button", { name: "Crear sucursal" }));
    await waitFor(() => expect(alHacer).toHaveBeenCalledWith("Ya existe una sucursal con ese código.", false));
    expect(alCerrar).not.toHaveBeenCalled();
  });

  it("elegir un mall rellena nombre, dirección y comuna de esa tarjeta", async () => {
    const u = abrir();
    await u.click(within(dialogo()).getByLabelText("Mall (opcional)"));
    await u.click(await screen.findByRole("option", { name: "Mall Plaza Norte" }));
    expect(within(dialogo()).getByLabelText("Nombre de la sucursal")).toHaveValue("Mall Plaza Norte");
    expect(within(dialogo()).getByLabelText("Dirección")).toHaveValue("Av. Américo Vespucio 1737");
    expect(within(dialogo()).getByLabelText("Comuna")).toHaveValue("Huechuraba");
  });

  it("«Quitar» saca una tarjeta", async () => {
    const u = abrir();
    await u.click(screen.getByRole("button", { name: /Agregar otra sucursal/ }));
    await u.click(within(dialogo()).getAllByRole("button", { name: "Quitar" })[0]);
    expect(within(dialogo()).getAllByLabelText("Nombre de la sucursal")).toHaveLength(1);
  });

  it("cada bloque se puede plegar", async () => {
    const u = abrir();
    const plegador = within(dialogo()).getAllByRole("button", { expanded: true })[0];
    await u.click(plegador);
    expect(within(dialogo()).getAllByRole("button", { expanded: false }).length).toBeGreaterThan(0);
  });
});
