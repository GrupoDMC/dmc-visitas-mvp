import { beforeEach, describe, expect, it, vi } from "vitest";

// Se conservan las clases de error reales (el código hace instanceof) y se
// reemplazan solo las funciones que escriben en la base.
vi.mock("@/lib/data/maestros", async (importar) => {
  const real = await importar<typeof import("@/lib/data/maestros")>();
  return {
    ...real,
    guardarCliente: vi.fn(),
    guardarMarca: vi.fn(),
    guardarMall: vi.fn(),
    guardarSucursal: vi.fn(),
    crearSucursalesLote: vi.fn(),
    guardarTecnico: vi.fn(),
    guardarUsuario: vi.fn(),
    ponerTiendasDeMall: vi.fn(),
  };
});
vi.mock("@/lib/data/roles", async (importar) => {
  const real = await importar<typeof import("@/lib/data/roles")>();
  const { estado } = await import("../helpers/sesion");
  return {
    ...real,
    accesoDeUsuario: async () => estado.acceso,
    eliminarRol: vi.fn(),
    guardarPermisosCelular: vi.fn(),
    guardarRol: vi.fn(),
    leerRol: vi.fn(),
  };
});
vi.mock("@/lib/data/auditoria", async (importar) => {
  const real = await importar<typeof import("@/lib/data/auditoria")>();
  return { ...real, auditar: vi.fn() };
});

import { revalidatePath } from "next/cache";
import * as acc from "@/app/actions/maestros";
import {
  CuentaNoPermitida,
  RutRepetido,
  TiendaEnOtroMall,
  crearSucursalesLote,
  guardarCliente,
  guardarMall,
  guardarMarca,
  guardarSucursal,
  guardarTecnico,
  guardarUsuario,
  ponerTiendasDeMall,
} from "@/lib/data/maestros";
import { eliminarRol, guardarPermisosCelular, guardarRol, leerRol } from "@/lib/data/roles";
import { auditar } from "@/lib/data/auditoria";
import { PERMISOS_COORDINADOR, TODOS_LOS_PERMISOS } from "@/lib/permisos";
import { cookiesEscritas, entrarComo, salir } from "../helpers/sesion";

const RUT_VALIDO = "11.111.111-1";

const cliente = (extra: Record<string, unknown> = {}) => ({
  rut: RUT_VALIDO,
  razonSocial: "Empresa Uno SpA",
  nombreFantasia: "Uno",
  activo: true,
  motivoInactivo: null,
  notas: null,
  planCalibracion: null,
  garantiaMeses: null,
  ...extra,
});

const sucursal = (extra: Record<string, unknown> = {}) => ({
  clienteId: 1,
  marcaId: 2,
  mallId: 3,
  nombre: "Tienda Centro",
  codigo: null,
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

const tecnico = (extra: Record<string, unknown> = {}) => ({
  rut: RUT_VALIDO,
  nombres: "Ana",
  apellidoPaterno: "Pérez",
  apellidoMaterno: null,
  email: "ana@example.com",
  telefono: null,
  activo: true,
  ...extra,
});

const usuario = (extra: Record<string, unknown> = {}) => ({
  email: "nuevo@example.com",
  rol: "COORDINADOR",
  rolId: 5,
  tecnicoId: null,
  activo: true,
  password: "Clave-Larga-12345",
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  salir();
  entrarComo("admin");
  vi.mocked(guardarCliente).mockResolvedValue(10);
  vi.mocked(guardarMarca).mockResolvedValue(11);
  vi.mocked(guardarMall).mockResolvedValue(12);
  vi.mocked(guardarSucursal).mockResolvedValue(13);
  vi.mocked(guardarRol).mockResolvedValue(14);
});

describe("alta y edición: son permisos distintos", () => {
  const modulos = [
    ["clientes", (id: number | null) => acc.guardarClienteAction(id, cliente() as never)],
    ["marcas", (id: number | null) => acc.guardarMarcaAction(id, { clienteId: 1, nombre: "Marca", activo: true })],
    ["malls", (id: number | null) => acc.guardarMallAction(id, { nombre: "Mall", direccion: "Calle 1", comuna: "X", region: "Y", activo: true } as never)],
    ["sucursales", (id: number | null) => acc.guardarSucursalAction(id, sucursal() as never)],
    ["tecnicos", (id: number | null) => acc.guardarTecnicoAction(id, tecnico() as never)],
    ["usuarios", (id: number | null) => acc.guardarUsuarioAction(id, usuario() as never)],
  ] as const;

  describe.each(modulos)("%s", (modulo, llamar) => {
    it("un alta pide «crear» y no basta con «editar»", async () => {
      entrarComo("coordinador", { permisos: [`${modulo}.ver`, `${modulo}.editar`] });
      expect((await llamar(null)).error).toMatch(/No tienes permiso/);
      entrarComo("coordinador", { permisos: [`${modulo}.ver`, `${modulo}.crear`] });
      expect((await llamar(null)).error ?? "").not.toMatch(/No tienes permiso/);
    });

    it("una edición pide «editar» y no basta con «crear»", async () => {
      entrarComo("coordinador", { permisos: [`${modulo}.ver`, `${modulo}.crear`] });
      expect((await llamar(7)).error).toMatch(/No tienes permiso/);
      entrarComo("coordinador", { permisos: [`${modulo}.ver`, `${modulo}.editar`] });
      expect((await llamar(7)).error ?? "").not.toMatch(/No tienes permiso/);
    });

    it("sin sesión o como técnico no se guarda nada", async () => {
      salir();
      expect((await llamar(null)).error).toMatch(/No tienes permiso/);
      entrarComo("tecnico");
      expect((await llamar(null)).error).toMatch(/No tienes permiso/);
    });
  });
});

describe("clientes", () => {
  it("guarda y devuelve el id (para altas hechas desde otro formulario)", async () => {
    expect(await acc.guardarClienteAction(null, cliente() as never)).toEqual({ ok: true, id: 10 });
    expect(guardarCliente).toHaveBeenCalledWith(null, expect.objectContaining({ razonSocial: "Empresa Uno SpA" }));
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  it.each([
    ["sin razón social", { razonSocial: " " }, /Razón social y RUT son obligatorios/],
    ["sin RUT", { rut: "" }, /Razón social y RUT son obligatorios/],
    ["RUT incompleto", { rut: "123" }, /RUT está incompleto/],
    ["inactivo sin motivo", { activo: false, motivoInactivo: "  " }, /por qué se desactiva el cliente/],
  ])("rechaza %s", async (_n, extra, mensaje) => {
    const r = await acc.guardarClienteAction(null, cliente(extra) as never);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(mensaje);
    expect(guardarCliente).not.toHaveBeenCalled();
  });

  it("acepta desactivar si se explica por qué", async () => {
    expect((await acc.guardarClienteAction(5, cliente({ activo: false, motivoInactivo: "Cerró" }) as never)).ok).toBe(true);
  });

  it("un RUT repetido se explica con el nombre del problema, no con el volcado del driver", async () => {
    vi.mocked(guardarCliente).mockRejectedValue(new RutRepetido("cliente", RUT_VALIDO));
    const r = await acc.guardarClienteAction(null, cliente() as never);
    expect(r.error).toBe(`El RUT ${RUT_VALIDO} ya está registrado en otra empresa. El RUT es único: busca esa empresa y edítala.`);
  });

  it("un campo de largo absurdo se rechaza", async () => {
    expect((await acc.guardarClienteAction(null, cliente({ razonSocial: "x".repeat(500) }) as never)).ok).toBe(false);
    expect(guardarCliente).not.toHaveBeenCalled();
  });
});

describe("marcas, malls y tiendas de un mall", () => {
  it("la marca necesita nombre", async () => {
    expect((await acc.guardarMarcaAction(null, { clienteId: 1, nombre: " ", activo: true })).error).toBe("El nombre de la marca es obligatorio.");
  });

  it("el mall necesita nombre, dirección, comuna y región", async () => {
    const mall = { nombre: "Mall", direccion: "Calle 1", comuna: "Santiago", region: "Metropolitana", activo: true };
    expect((await acc.guardarMallAction(null, mall as never)).id).toBe(12);
    for (const campo of ["nombre", "direccion", "comuna", "region"]) {
      const r = await acc.guardarMallAction(null, { ...mall, [campo]: "  " } as never);
      expect(r.error, campo).toBe("Nombre, dirección, comuna y región son obligatorios.");
    }
  });

  it("un nombre de mall repetido o un mall inexistente se traducen", async () => {
    const mall = { nombre: "Mall", direccion: "Calle 1", comuna: "Santiago", region: "Metropolitana", activo: true } as never;
    vi.mocked(guardarMall).mockRejectedValueOnce(new Error("Violation of UNIQUE KEY constraint 'uq_mall_nombre'"));
    expect((await acc.guardarMallAction(null, mall)).error).toBe("Ya existe un mall con ese nombre.");
    vi.mocked(guardarMall).mockRejectedValueOnce(new Error("conflicted with FOREIGN KEY constraint fk_sucursal_mall"));
    expect((await acc.guardarMallAction(null, mall)).error).toBe("Ese mall ya no existe. Recarga la página.");
  });

  describe("guardarTiendasMallAction", () => {
    it("deja en el mall exactamente esas tiendas", async () => {
      expect((await acc.guardarTiendasMallAction(3, [1, 2, 3])).ok).toBe(true);
      expect(ponerTiendasDeMall).toHaveBeenCalledWith(3, [1, 2, 3]);
    });

    it("rechaza listas con repetidos, ids inválidos o un mall inválido", async () => {
      expect((await acc.guardarTiendasMallAction(3, [1, 1])).error).toBe("La lista de tiendas no es válida.");
      expect((await acc.guardarTiendasMallAction(3, [0])).error).toBe("La lista de tiendas no es válida.");
      expect((await acc.guardarTiendasMallAction(0, [1])).error).toBe("La lista de tiendas no es válida.");
      expect(ponerTiendasDeMall).not.toHaveBeenCalled();
    });

    it("nombra las tiendas que ya están en otro mall", async () => {
      vi.mocked(ponerTiendasDeMall).mockRejectedValue(new TiendaEnOtroMall(["Tienda A", "Tienda B"]));
      const r = await acc.guardarTiendasMallAction(3, [1, 2]);
      expect(r.error).toBe("Ya está en otro mall: Tienda A, Tienda B. Una sucursal está en un solo mall: quítala de ese primero.");
    });
  });
});

describe("sucursales", () => {
  it("guarda con mall y devuelve el id", async () => {
    expect(await acc.guardarSucursalAction(null, sucursal() as never)).toEqual({ ok: true, id: 13 });
  });

  it("a la calle (sin mall) exige dirección; en un mall no", async () => {
    expect((await acc.guardarSucursalAction(null, sucursal({ mallId: null, direccion: " " }) as never)).error).toBe(
      "Una sucursal sin mall necesita su dirección de calle."
    );
    expect((await acc.guardarSucursalAction(null, sucursal({ mallId: null, direccion: "Calle 5" }) as never)).ok).toBe(true);
    expect((await acc.guardarSucursalAction(null, sucursal({ mallId: 3, direccion: "" }) as never)).ok).toBe(true);
  });

  it.each([
    ["sin nombre", { nombre: " " }, /Nombre, cliente y marca son obligatorios/],
    ["sin marca", { marcaId: 0 }, /Dato no válido|obligatorios/],
    ["inactiva sin motivo", { activo: false }, /por qué se desactiva la sucursal/],
    ["fecha de instalación inválida", { fechaInstalacion: "15/03/2026" }, /fecha/i],
  ])("rechaza %s", async (_n, extra, mensaje) => {
    const r = await acc.guardarSucursalAction(null, sucursal(extra) as never);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(mensaje);
    expect(guardarSucursal).not.toHaveBeenCalled();
  });

  it("traduce los choques de unicidad", async () => {
    const casos: [string, string][] = [
      ["uq_sucursal_codigo", "Ya existe una sucursal con ese código."],
      ["uq_sucursal_marca_nombre", "Esa marca ya tiene una sucursal con ese nombre."],
      ["fk_sucursal_marca", "La marca elegida no es de ese cliente. Elígela de nuevo."],
    ];
    for (const [restriccion, esperado] of casos) {
      vi.mocked(guardarSucursal).mockRejectedValueOnce(new Error(`constraint ${restriccion}`));
      expect((await acc.guardarSucursalAction(null, sucursal() as never)).error).toBe(esperado);
    }
  });

  describe("crearSucursalesLoteAction (carga masiva)", () => {
    const fila = (extra: Record<string, unknown> = {}) => ({
      mallId: null,
      nombre: "Tienda 1",
      codigo: null,
      direccion: "Calle 1",
      comuna: "Santiago",
      region: "Metropolitana",
      ...extra,
    });

    it("crea todas y devuelve cuántas", async () => {
      vi.mocked(crearSucursalesLote).mockResolvedValue(2);
      expect(await acc.crearSucursalesLoteAction(1, 2, [fila(), fila({ nombre: "Tienda 2" })] as never)).toEqual({ ok: true, creadas: 2 });
      expect(crearSucursalesLote).toHaveBeenCalledWith(1, 2, expect.arrayContaining([expect.objectContaining({ nombre: "Tienda 2" })]));
    });

    it("sin filas no hay nada por crear", async () => {
      expect((await acc.crearSucursalesLoteAction(1, 2, [])).error).toBe("No hay sucursales por crear.");
    });

    it("una fila incompleta frena todo el lote (nada queda a medias)", async () => {
      for (const campo of ["nombre", "direccion", "comuna", "region"]) {
        const r = await acc.crearSucursalesLoteAction(1, 2, [fila(), fila({ [campo]: " " })] as never);
        expect(r.error, campo).toBe("Cada sucursal necesita nombre, dirección, comuna y región.");
      }
      expect(crearSucursalesLote).not.toHaveBeenCalled();
    });

    it("rechaza lotes de más de 1000 filas", async () => {
      const mil1 = Array.from({ length: 1001 }, (_, i) => fila({ nombre: `T${i}` }));
      expect((await acc.crearSucursalesLoteAction(1, 2, mil1 as never)).ok).toBe(false);
      expect(crearSucursalesLote).not.toHaveBeenCalled();
    });

    it("si la base falla, informa sin éxito parcial", async () => {
      vi.mocked(crearSucursalesLote).mockRejectedValue(new Error("constraint uq_sucursal_codigo"));
      const r = await acc.crearSucursalesLoteAction(1, 2, [fila()] as never);
      expect(r).toEqual({ ok: false, error: "Ya existe una sucursal con ese código." });
    });
  });
});

describe("técnicos", () => {
  it("guarda", async () => {
    expect((await acc.guardarTecnicoAction(null, tecnico() as never)).ok).toBe(true);
  });
  it("exige nombre, RUT y correo, y un RUT completo", async () => {
    expect((await acc.guardarTecnicoAction(null, tecnico({ nombres: " " }) as never)).error).toBe("Nombre, RUT y correo son obligatorios.");
    expect((await acc.guardarTecnicoAction(null, tecnico({ email: " " }) as never)).error).toBe("Nombre, RUT y correo son obligatorios.");
    expect((await acc.guardarTecnicoAction(null, tecnico({ rut: "12" }) as never)).error).toBe("El RUT está incompleto.");
  });
  it("un RUT repetido se nombra «otra persona»", async () => {
    vi.mocked(guardarTecnico).mockRejectedValue(new RutRepetido("tecnico", RUT_VALIDO));
    expect((await acc.guardarTecnicoAction(null, tecnico() as never)).error).toMatch(/ya está registrado en otra persona/);
  });
});

describe("usuarios", () => {
  beforeEach(() => {
    vi.mocked(guardarUsuario).mockResolvedValue({ id: 99, sesionVersion: 1 });
  });

  it("crea la cuenta, audita el alta y no re-firma la sesión de quien guarda", async () => {
    expect((await acc.guardarUsuarioAction(null, usuario() as never)).ok).toBe(true);
    expect(auditar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accion: "usuario.alta", entidadId: 99 }));
    expect(cookiesEscritas).toEqual([]);
  });

  it("valida correo, técnico vinculado y la política de contraseñas (al crear siempre)", async () => {
    expect((await acc.guardarUsuarioAction(null, usuario({ email: "sin-arroba" }) as never)).error).toBe("Escribe un correo válido.");
    expect((await acc.guardarUsuarioAction(null, usuario({ rol: "TECNICO", tecnicoId: 0 }) as never)).error).toBe(
      "Un usuario TÉCNICO necesita técnico vinculado."
    );
    for (const mala of ["", "corta", "nuevo@example.com"]) {
      expect((await acc.guardarUsuarioAction(null, usuario({ password: mala }) as never)).error, mala).toBeTruthy();
    }
    expect(guardarUsuario).not.toHaveBeenCalled();
  });

  it("al editar, la contraseña vacía significa «no cambiarla»; si viene, debe cumplir la política", async () => {
    expect((await acc.guardarUsuarioAction(5, usuario({ password: "" }) as never)).ok).toBe(true);
    expect((await acc.guardarUsuarioAction(5, usuario({ password: "corta" }) as never)).ok).toBe(false);
  });

  it("si quien guarda edita su propia cuenta, su sesión se re-firma con la versión nueva", async () => {
    vi.mocked(guardarUsuario).mockResolvedValue({ id: 1, sesionVersion: 4 });
    await acc.guardarUsuarioAction(1, usuario({ password: "" }) as never);
    expect(cookiesEscritas.map((c) => c.nombre)).toContain("dmc_session");
  });

  it("audita los cambios sensibles de una cuenta existente: baja, rol y contraseña", async () => {
    vi.mocked(guardarUsuario).mockImplementation((async (_id: unknown, _d: unknown, control: { autorizar: (a: unknown, n: unknown) => unknown }) => {
      control.autorizar({ id: 99, email: "x", rol: "COORDINADOR", rolId: 5, activo: true, permisos: [] }, { rol: "ADMIN", rolId: null, permisos: TODOS_LOS_PERMISOS });
      return { id: 99, sesionVersion: 2 };
    }) as never);
    await acc.guardarUsuarioAction(99, usuario({ rol: "ADMIN", rolId: null, activo: false, password: "Otra-Clave-Larga-1" }) as never);
    const acciones = vi.mocked(auditar).mock.calls.map((c) => c[1].accion);
    expect(acciones).toEqual(expect.arrayContaining(["usuario.desactivar", "usuario.rol", "password.reseteo"]));
  });

  describe("no se puede fabricar más acceso del que se tiene (autorizar)", () => {
    /** Llama a la función `autorizar` que la acción le pasa a la capa de datos. */
    async function autorizar(actual: unknown, nueva: unknown, id: number | null = 99): Promise<unknown> {
      let resultado: unknown = "no llamado";
      vi.mocked(guardarUsuario).mockImplementation((async (_i: unknown, _d: unknown, control: { autorizar: (a: unknown, n: unknown) => unknown }) => {
        resultado = control.autorizar(actual, nueva);
        return { id: 99, sesionVersion: 1 };
      }) as never);
      await acc.guardarUsuarioAction(id, usuario() as never);
      return resultado;
    }

    const cuenta = (extra: Record<string, unknown> = {}) => ({ id: 99, email: "x@example.com", rol: "COORDINADOR", rolId: 5, activo: true, permisos: ["visitas.ver"], ...extra });

    it("el administrador puede con todo", async () => {
      expect(await autorizar(cuenta({ rol: "ADMIN", permisos: TODOS_LOS_PERMISOS }), cuenta({ rol: "ADMIN", permisos: TODOS_LOS_PERMISOS }))).toBeNull();
    });

    it("un coordinador no puede tocar una cuenta de administrador", async () => {
      entrarComo("coordinador", { permisos: [...PERMISOS_COORDINADOR, "usuarios.crear", "usuarios.editar"] });
      expect(await autorizar(cuenta({ rol: "ADMIN", permisos: TODOS_LOS_PERMISOS }), cuenta())).toMatch(/Solo un administrador puede modificar cuentas de administrador/);
    });

    it("un coordinador no puede crear un administrador", async () => {
      entrarComo("coordinador", { permisos: [...PERMISOS_COORDINADOR, "usuarios.crear"] });
      expect(await autorizar(null, cuenta({ rol: "ADMIN", permisos: TODOS_LOS_PERMISOS }), null)).toBe(
        "Solo un administrador puede crear o editar cuentas de administrador."
      );
    });

    it("un coordinador no puede dar un rol con permisos que él no tiene", async () => {
      entrarComo("coordinador", { permisos: ["usuarios.ver", "usuarios.crear", "visitas.ver"] });
      expect(await autorizar(null, cuenta({ permisos: ["visitas.ver", "visitas.eliminar"] }), null)).toBe(
        "El rol elegido tiene permisos que tú no tienes: no lo puedes asignar."
      );
    });

    it("un coordinador no puede cambiarse su propio rol, aunque el rol destino sea menor", async () => {
      entrarComo("coordinador", { id: 2, permisos: [...PERMISOS_COORDINADOR, "usuarios.editar"] });
      const actual = cuenta({ id: 2, rolId: 5, permisos: ["visitas.ver"] });
      const nueva = cuenta({ id: 2, rolId: 6, permisos: ["visitas.ver"] });
      expect(await autorizar(actual, nueva, 2)).toBe("No puedes cambiar tu propio rol.");
    });

    it("un coordinador sí puede editar a un coordinador con permisos iguales o menores", async () => {
      entrarComo("coordinador", { permisos: [...PERMISOS_COORDINADOR, "usuarios.editar"] });
      expect(await autorizar(cuenta({ permisos: ["visitas.ver"] }), cuenta({ permisos: ["visitas.ver"] }))).toBeNull();
    });
  });

  it("traduce errores de unicidad y de cuenta no permitida", async () => {
    vi.mocked(guardarUsuario).mockRejectedValueOnce(new Error("constraint uq_usuario_email"));
    expect((await acc.guardarUsuarioAction(null, usuario() as never)).error).toBe("Ya existe un registro con ese correo.");
    vi.mocked(guardarUsuario).mockRejectedValueOnce(new CuentaNoPermitida("No puedes tocar esa cuenta."));
    expect((await acc.guardarUsuarioAction(null, usuario() as never)).error).toBe("No puedes tocar esa cuenta.");
    vi.mocked(guardarUsuario).mockRejectedValueOnce(new Error("constraint ck_usuario_tecnico"));
    expect((await acc.guardarUsuarioAction(null, usuario() as never)).error).toMatch(/necesita un técnico vinculado/);
  });
});

describe("roles y permisos", () => {
  const rol = (extra: Record<string, unknown> = {}) => ({ nombre: "Supervisor", descripcion: null, permisos: ["visitas.ver"], ...extra });

  it("crea un rol, normaliza sus permisos (agrega el «ver» del módulo) y audita", async () => {
    vi.mocked(leerRol).mockResolvedValue(null);
    expect((await acc.guardarRolAction(null, rol({ permisos: ["visitas.crear", "inexistente.x"] }))).ok).toBe(true);
    expect(guardarRol).toHaveBeenCalledWith(null, { nombre: "Supervisor", descripcion: null, permisos: ["visitas.ver", "visitas.crear"] });
    expect(auditar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accion: "rol.alta", entidadId: 14 }));
  });

  it("no acepta nombres de los roles fijos ni un rol vacío", async () => {
    for (const n of ["Administrador", "administrador", "Técnico", "tecnico"]) {
      expect((await acc.guardarRolAction(null, rol({ nombre: n }))).error, n).toMatch(/rol fijo del sistema/);
    }
    expect((await acc.guardarRolAction(null, rol({ nombre: "  " }))).error).toBe("El rol necesita un nombre.");
    expect((await acc.guardarRolAction(null, rol({ permisos: [] }))).error).toMatch(/Marca al menos un permiso/);
    expect((await acc.guardarRolAction(null, rol({ permisos: ["no.existe"] }))).error).toMatch(/Marca al menos un permiso/);
    expect(guardarRol).not.toHaveBeenCalled();
  });

  describe("un no-administrador no escala privilegios por los roles", () => {
    beforeEach(() => entrarComo("coordinador", { permisos: ["usuarios.ver", "usuarios.roles", "visitas.ver", "visitas.crear"] }));

    it("no puede dar un permiso que no tiene", async () => {
      vi.mocked(leerRol).mockResolvedValue(null);
      const r = await acc.guardarRolAction(null, rol({ permisos: ["visitas.ver", "visitas.eliminar"] }));
      expect(r.error).toBe("Solo puedes dar o quitar permisos que tú también tienes.");
      expect(guardarRol).not.toHaveBeenCalled();
    });

    it("no puede editar un rol que tiene permisos que él no tiene", async () => {
      vi.mocked(leerRol).mockResolvedValue({ id: 3, nombre: "Jefe", permisos: ["visitas.ver", "visitas.eliminar"] });
      expect((await acc.guardarRolAction(3, rol())).error).toMatch(/tiene permisos que tú no tienes: no lo puedes editar/);
    });

    it("no puede quitarle a un rol un permiso que él no tiene", async () => {
      vi.mocked(leerRol).mockResolvedValue({ id: 3, nombre: "Jefe", permisos: ["visitas.ver", "visitas.crear"] });
      // Quita visitas.crear (que sí tiene): permitido.
      expect((await acc.guardarRolAction(3, rol({ nombre: "Jefe", permisos: ["visitas.ver"] }))).ok).toBe(true);
    });

    it("un rol que ya no existe se avisa", async () => {
      vi.mocked(leerRol).mockResolvedValue(null);
      expect((await acc.guardarRolAction(3, rol())).error).toBe("Ese rol ya no existe. Recarga la página.");
    });

    it("no puede eliminar un rol más poderoso que él", async () => {
      vi.mocked(leerRol).mockResolvedValue({ id: 3, nombre: "Jefe", permisos: ["visitas.eliminar"] });
      expect((await acc.eliminarRolAction(3)).error).toMatch(/no lo puedes eliminar/);
      expect(eliminarRol).not.toHaveBeenCalled();
    });
  });

  it("eliminarRolAction: pasa el motivo de la base (rol en uso), audita si se pudo", async () => {
    vi.mocked(leerRol).mockResolvedValue({ id: 3, nombre: "Jefe", permisos: ["visitas.ver"] });
    vi.mocked(eliminarRol).mockResolvedValueOnce("Hay 2 usuarios con ese rol." as never);
    expect((await acc.eliminarRolAction(3)).error).toBe("Hay 2 usuarios con ese rol.");
    expect(auditar).not.toHaveBeenCalled();
    vi.mocked(eliminarRol).mockResolvedValueOnce(null as never);
    expect((await acc.eliminarRolAction(3)).ok).toBe(true);
    expect(auditar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accion: "rol.eliminar", detalle: { nombre: "Jefe" } }));
    expect((await acc.eliminarRolAction(0)).error).toBe("Ese rol no existe.");
  });

  it("guardarPermisosCelularAction guarda y audita", async () => {
    expect((await acc.guardarPermisosCelularAction(["celular.estado"])).ok).toBe(true);
    expect(guardarPermisosCelular).toHaveBeenCalledWith(["celular.estado"]);
    expect(auditar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accion: "permisos_celular.editar" }));
  });
});

describe("errores inesperados", () => {
  it("no se filtran al usuario: credenciales, hosts ni nombres de base", async () => {
    vi.mocked(guardarCliente).mockRejectedValue(new Error("Login failed for user 'dmc_app'. Server 74.0.0.1,14330 database DMC_Contingencia"));
    const r = await acc.guardarClienteAction(null, cliente() as never);
    expect(r.error).toBe("No se pudo guardar. Revisa los datos e inténtalo otra vez.");
  });
});
