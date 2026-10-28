import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Las acciones del servidor no se ejecutan: cualquier export es un espía.
const { accionFalsa } = vi.hoisted(() => ({
  accionFalsa: () => new Proxy({}, { get: (_o, k) => (k === "then" ? undefined : vi.fn()) }),
}));
vi.mock("@/app/actions/admin", accionFalsa);
vi.mock("@/app/actions/maestros", accionFalsa);
vi.mock("@/app/actions/personas-local", accionFalsa);
vi.mock("@/app/actions/adjuntos", accionFalsa);
vi.mock("@/app/actions/visitas-papel", accionFalsa);

import VisitasTable from "@/components/admin/VisitasTable";
import { ReferenciasProvider, REFERENCIAS_VACIAS } from "@/lib/ui/referencias";
import { SIN_FILTROS, type FiltrosVisitas, type OpcionesFiltroVisitas } from "@/lib/ui/filtros-visitas";
import { pintar, router, visitaFalsa } from "../helpers/componentes";

const opciones: OpcionesFiltroVisitas = {
  regiones: ["Valparaíso", "Metropolitana"],
  malls: [[5, "Mall Plaza"]],
  clientes: [
    [1, "Cliente Uno"],
    [2, "Cliente Dos"],
  ],
  marcas: [
    [7, "Marca Norte"],
    [8, "Marca Sur"],
  ],
  tiendas: [[10, "Tienda Centro"]],
};

function tabla(f: Partial<FiltrosVisitas> = {}, visitas = [visitaFalsa()], extra: Record<string, unknown> = {}) {
  const filtros = { ...SIN_FILTROS, ...f };
  return (
    <VisitasTable
      kicker="Panel"
      title="Visitas"
      filtros={filtros}
      pagina={{ visitas, total: visitas.length, pagina: 1, paginas: 1 }}
      opciones={opciones}
      {...extra}
    />
  );
}

const PERMISOS_TOTALES = ["visitas.ver", "visitas.crear", "visitas.editar", "visitas.cancelar", "visitas.eliminar", "visitas.masivo"];

/** Despliega los selectores de la barra de filtros. */
async function abrirFiltros(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole("button", { name: /Colocar filtro|Editar filtros/ }));
}

describe("listado de visitas", () => {
  it("muestra cada visita con folio, cliente, sucursal, técnico, motivo y estado", () => {
    pintar(tabla({}, [visitaFalsa({ folio: "V-0100", estado: "COMPLETADA" }), visitaFalsa({ folio: "V-0101", estado: "EN_CURSO" })]));
    const filas = screen.getAllByRole("row").slice(1);
    expect(filas).toHaveLength(2);
    expect(within(filas[0]).getByText("V-0100")).toBeInTheDocument();
    expect(within(filas[0]).getByText("Completada")).toBeInTheDocument();
    expect(within(filas[1]).getByText("En curso")).toBeInTheDocument();
    expect(within(filas[0]).getByText("Cliente Uno")).toBeInTheDocument();
    expect(within(filas[0]).getByText("Tienda Centro")).toBeInTheDocument();
    expect(within(filas[0]).getByText("Ana Pérez")).toBeInTheDocument();
    expect(within(filas[0]).getByText("Visita preventiva")).toBeInTheDocument();
  });

  it("cuenta los registros en singular y plural", () => {
    const { unmount } = pintar(tabla({}, [visitaFalsa()]));
    expect(screen.getByText("1 registro")).toBeInTheDocument();
    unmount();
    pintar(tabla({}, [visitaFalsa(), visitaFalsa()]));
    expect(screen.getByText("2 registros")).toBeInTheDocument();
  });

  it("una visita sin hora lo dice; con margen de días muestra el rango", () => {
    pintar(tabla({}, [visitaFalsa({ horaProgramada: null, fechaHasta: "2026-10-30" })]));
    expect(screen.getByText("Sin hora")).toBeInTheDocument();
    expect(screen.getByText("2026-10-26 → 2026-10-30")).toBeInTheDocument();
  });

  it("marca las visitas eliminadas y las editadas", () => {
    pintar(
      tabla({}, [
        visitaFalsa({ eliminacion: { motivo: "x" } }),
        visitaFalsa({ estado: "COMPLETADA", ediciones: [{ secciones: ["Responsable"], motivo: "Tipeo" }] }),
      ])
    );
    expect(screen.getByText("Eliminada")).toBeInTheDocument();
    expect(screen.getByText("Editada")).toHaveAttribute("title", expect.stringContaining("Tipeo"));
  });

  it("hacer clic en una fila (o en el ojo) abre el acta", async () => {
    const u = userEvent.setup();
    pintar(tabla({}, [visitaFalsa({ folio: "V-0200" })]));
    await u.click(screen.getByText("V-0200"));
    expect(router.push).toHaveBeenCalledWith("/admin/visitas/V-0200");
    router.push.mockClear();
    await u.click(screen.getByRole("button", { name: "Ver acta V-0200" }));
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("los técnicos ayudantes se muestran junto al titular", () => {
    pintar(tabla({}, [visitaFalsa({ tecnicoAyudante: { id: 2, nombreCompleto: "Beto Soto" } })]));
    expect(screen.getByText("Ana Pérez + Beto Soto")).toBeInTheDocument();
  });
});

describe("filtros del listado (viven en la URL: cambiar uno es navegar)", () => {
  it("cambiar «Mostrar» (límite) navega con el límite nuevo y vuelve a la página 1", async () => {
    const u = userEvent.setup();
    pintar(tabla({ pagina: 3 }));
    await u.selectOptions(screen.getByRole("combobox", { name: "Visitas por página" }), "25");
    expect(router.replace).toHaveBeenCalledTimes(1);
    const destino = router.replace.mock.calls[0][0] as string;
    expect(destino).toContain("limite=25");
    expect(destino).not.toContain("pagina=3");
  });

  it("el límite ofrece 10, 15, 25 y 50", () => {
    pintar(tabla());
    const opcionesLimite = within(screen.getByRole("combobox", { name: "Visitas por página" })).getAllByRole("option");
    expect(opcionesLimite.map((o) => o.textContent)).toEqual(["10", "15", "25", "50"]);
  });

  it("escribir en la búsqueda navega con q, pero solo cuando se deja de teclear (350 ms)", () => {
    vi.useFakeTimers();
    pintar(tabla());
    const campo = screen.getByLabelText(/Buscar folio, cliente, sucursal/);
    fireEvent.change(campo, { target: { value: "V-05" } });
    act(() => vi.advanceTimersByTime(300));
    expect(router.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace.mock.calls[0][0]).toContain("q=V-05");
  });

  it("filtrar por estado: marca varios y navega una sola vez al cerrar", async () => {
    const u = userEvent.setup();
    pintar(tabla());
    await abrirFiltros(u);
    await u.click(screen.getByRole("combobox", { name: /Estado de la visita/ }));
    await u.click(screen.getByRole("option", { name: /Completada/ }));
    await u.click(screen.getByRole("option", { name: /Pendiente/ }));
    expect(router.replace).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(router.replace).toHaveBeenCalledTimes(1);
    const url = new URL(router.replace.mock.calls[0][0] as string, "http://x");
    expect(url.searchParams.getAll("estado")).toEqual(["COMPLETADA", "PENDIENTE"]);
  });

  it("filtrar por cliente muestra los filtros de marca y sucursal; sin cliente no existen", async () => {
    const u = userEvent.setup();
    const { container, unmount } = pintar(tabla());
    await abrirFiltros(u);
    expect(container.querySelector("label[for=fv-marca]")).toBeNull();
    expect(container.querySelector("label[for=fv-tienda]")).toBeNull();
    unmount();

    const otra = pintar(tabla({ clienteIds: ["1"] }));
    await abrirFiltros(u);
    expect(otra.container.querySelector("label[for=fv-marca]")).toHaveTextContent("Marca");
    expect(otra.container.querySelector("label[for=fv-tienda]")).toHaveTextContent("Sucursal");
    // Con un cliente elegido el filtro por tipo de falla deja de aplicar.
    expect(screen.queryByText("Tipo de falla registrada")).toBeNull();
  });

  it("filtrar por región", async () => {
    const u = userEvent.setup();
    pintar(tabla());
    await abrirFiltros(u);
    await u.click(screen.getByRole("combobox", { name: /Zona|Todas las zonas/ }));
    await u.click(screen.getByRole("option", { name: "Metropolitana" }));
    await u.click(screen.getByRole("button", { name: "Aplicar" }));
    const url = new URL(router.replace.mock.calls[0][0] as string, "http://x");
    expect(url.searchParams.getAll("region")).toEqual(["Metropolitana"]);
  });

  it("los selectores van en el orden de la cascada y ya no hay filtro por semana", async () => {
    const u = userEvent.setup();
    const { container } = pintar(tabla({ clienteIds: ["1"] }));
    await abrirFiltros(u);
    const orden = [...container.querySelectorAll("label")].map((l) => l.textContent);
    const cadena = ["Zona (región)", "Mall", "Cliente", "Marca", "Sucursal"];
    expect(orden.filter((t) => cadena.includes(t ?? ""))).toEqual(cadena);
    expect(container.querySelector("#fv-semana")).toBeNull();
    expect(screen.queryByText(/Semana/)).toBeNull();
  });

  it("filtrar por marca: ofrece las marcas recibidas y navega con ellas", async () => {
    const u = userEvent.setup();
    pintar(tabla({ clienteIds: ["1"] }));
    await abrirFiltros(u);
    await u.click(screen.getByRole("combobox", { name: /Marca|Todas las marcas/ }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Marca Norte"), expect.stringContaining("Marca Sur")])
    );
    await u.click(screen.getByRole("option", { name: /Marca Norte/ }));
    await u.click(screen.getByRole("option", { name: /Marca Sur/ }));
    await u.click(screen.getByRole("button", { name: "Aplicar" }));
    const url = new URL(router.replace.mock.calls[0][0] as string, "http://x");
    expect(url.searchParams.getAll("cliente")).toEqual(["1"]);
    expect(url.searchParams.getAll("marca")).toEqual(["7", "8"]);
  });

  it("cambiar la zona navega sin tocar el mall: el servidor descarta lo que ya no cabe", async () => {
    const u = userEvent.setup();
    pintar(tabla({ mallId: "5" }));
    await abrirFiltros(u);
    await u.click(screen.getByRole("combobox", { name: /Zona|Todas las zonas/ }));
    await u.click(screen.getByRole("option", { name: "Valparaíso" }));
    await u.click(screen.getByRole("button", { name: "Aplicar" }));
    const url = new URL(router.replace.mock.calls[0][0] as string, "http://x");
    expect(url.searchParams.getAll("region")).toEqual(["Valparaíso"]);
    expect(url.searchParams.get("mall")).toBe("5");
  });

  it("los filtros activos aparecen como chips con su nombre y cada uno se puede quitar", async () => {
    const u = userEvent.setup();
    pintar(
      tabla({
        estados: ["COMPLETADA"],
        clienteIds: ["2"],
        marcaIds: ["8"],
        sucursalIds: ["10"],
        regiones: ["Valparaíso"],
        mallId: "5",
      })
    );
    for (const chip of [
      "Estado: Completada",
      "Cliente: Cliente Dos",
      "Marca: Marca Sur",
      "Tienda: Tienda Centro",
      "Zona: Valparaíso",
      "Mall: Mall Plaza",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(chip) })).toBeInTheDocument();
    }

    await u.click(screen.getByRole("button", { name: /Zona: Valparaíso/ }));
    const url = new URL(router.replace.mock.calls[0][0] as string, "http://x");
    expect(url.searchParams.getAll("region")).toEqual([]);
    expect(url.searchParams.getAll("estado")).toEqual(["COMPLETADA"]);
  });

  it("quitar el último cliente también quita marcas y sucursales (sin cliente no aplican)", async () => {
    const u = userEvent.setup();
    pintar(tabla({ clienteIds: ["2"], marcaIds: ["8"], sucursalIds: ["10"] }));
    await u.click(screen.getByRole("button", { name: /Cliente: Cliente Dos/ }));
    const url = new URL(router.replace.mock.calls[0][0] as string, "http://x");
    expect(url.searchParams.getAll("cliente")).toEqual([]);
    expect(url.searchParams.getAll("marca")).toEqual([]);
    expect(url.searchParams.getAll("tienda")).toEqual([]);
  });

  it("«Quitar todos» limpia los filtros pero conserva el límite elegido", async () => {
    const u = userEvent.setup();
    pintar(tabla({ estados: ["COMPLETADA"], regiones: ["Valparaíso"], limite: 25 }));
    await u.click(screen.getByRole("button", { name: "Quitar todos" }));
    const url = new URL(router.replace.mock.calls[0][0] as string, "http://x");
    expect(url.searchParams.getAll("estado")).toEqual([]);
    expect(url.searchParams.getAll("region")).toEqual([]);
    expect(url.searchParams.get("limite")).toBe("25");
  });

  it("el botón de filtros cuenta cuántos hay puestos", () => {
    pintar(tabla({ estados: ["COMPLETADA"], regiones: ["Valparaíso"] }));
    expect(screen.getByRole("button", { name: "Editar filtros (2)" })).toBeInTheDocument();
  });

  it("«Eliminadas» solo se ofrece al administrador y va sola (excluye los demás estados)", async () => {
    const u = userEvent.setup();
    pintar(tabla({ estados: ["COMPLETADA"] }, [visitaFalsa()], { eliminadas: 4 }));
    await abrirFiltros(u);
    await u.click(screen.getByRole("combobox", { name: /Estado de la visita|Completada/ }));
    await u.click(screen.getByRole("option", { name: /Eliminadas \(4\)/ }));
    await u.click(screen.getByRole("button", { name: "Aplicar" }));
    const url = new URL(router.replace.mock.calls[0][0] as string, "http://x");
    expect(url.searchParams.getAll("estado")).toEqual(["ELIMINADAS"]);
  });
});

describe("botones según permisos", () => {
  it("quien puede crear ve «Nueva visita», «Visitas masivas» y «Visitas en papel»", () => {
    pintar(tabla(), { permisos: PERMISOS_TOTALES });
    expect(screen.getByRole("button", { name: /Nueva visita/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Visitas masivas/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Visitas en papel/ })).toHaveAttribute("href", "/admin/visitas/papel");
  });

  it("quien solo puede ver no ve ninguno de crear", () => {
    pintar(tabla(), { permisos: ["visitas.ver"] });
    expect(screen.queryByRole("button", { name: /Nueva visita/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Visitas masivas/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Acciones múltiples/ })).toBeNull();
  });

  it("«permiteCrear: false» (vista de reagendas) esconde el alta aun con permiso", () => {
    pintar(tabla({}, [visitaFalsa()], { permiteCrear: false }), { permisos: PERMISOS_TOTALES });
    expect(screen.queryByRole("button", { name: /Nueva visita/ })).toBeNull();
  });

  it("«Acciones múltiples» pide el permiso masivo Y al menos una operación", () => {
    const { unmount } = pintar(tabla(), { permisos: ["visitas.ver", "visitas.masivo"] });
    expect(screen.queryByRole("button", { name: /Acciones múltiples/ })).toBeNull();
    unmount();
    pintar(tabla(), { permisos: ["visitas.ver", "visitas.masivo", "visitas.editar"] });
    expect(screen.getByRole("button", { name: /Acciones múltiples/ })).toBeInTheDocument();
  });

  it("con el modo de selección prendido, el clic marca la fila en vez de abrir el acta", async () => {
    const u = userEvent.setup();
    pintar(tabla({}, [visitaFalsa({ folio: "V-0300" }), visitaFalsa({ folio: "V-0301" })]), { permisos: PERMISOS_TOTALES });
    await u.click(screen.getByRole("button", { name: /Acciones múltiples/ }));
    await u.click(screen.getByText("V-0300"));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByText("1 visita marcada")).toBeInTheDocument();
  });
});

describe("sin resultados y rol", () => {
  it("sin visitas muestra 0 registros y la tabla vacía", () => {
    pintar(tabla({}, []));
    expect(screen.getByText("0 registros")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1);
  });

  it("el contexto de referencias vacío no rompe el listado (rol técnico, sin permisos)", () => {
    render(
      <ReferenciasProvider valor={REFERENCIAS_VACIAS}>
        {tabla()}
      </ReferenciasProvider>
    );
    expect(screen.getByText("1 registro")).toBeInTheDocument();
  });
});
