import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import SelectBuscable from "@/components/ui/SelectBuscable";
import SelectMultiple from "@/components/ui/SelectMultiple";
import SelectConAlta from "@/components/ui/SelectConAlta";
import { pintar } from "../helpers/componentes";

vi.mock("@/app/actions/maestros", () => ({
  guardarClienteAction: vi.fn(),
  guardarMallAction: vi.fn(),
  guardarMarcaAction: vi.fn(),
  guardarSucursalAction: vi.fn(),
}));

const OPCIONES = [
  { v: "", t: "Todas" },
  { v: "1", t: "Egaña Centro" },
  { v: "2", t: "Plaza Norte" },
  { v: "3", t: "Mall del Sur" },
];

function Buscable(props: Partial<React.ComponentProps<typeof SelectBuscable>> & { inicial?: string }) {
  const [v, setV] = useState(props.inicial ?? "");
  return (
    <SelectBuscable
      ariaLabel="Sucursal"
      valor={v}
      opciones={OPCIONES}
      onChange={(x) => {
        setV(x);
        props.onChange?.(x);
      }}
      onAgregar={props.onAgregar}
    />
  );
}

describe("SelectBuscable", () => {
  it("muestra la opción elegida y abre la lista al enfocar", async () => {
    const u = userEvent.setup();
    render(<Buscable inicial="2" />);
    const campo = screen.getByRole("combobox", { name: "Sucursal" });
    expect(campo).toHaveAttribute("placeholder", "Plaza Norte");
    expect(screen.queryByRole("listbox")).toBeNull();
    await u.click(campo);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("option", { name: /Plaza Norte/ })).toHaveAttribute("aria-selected", "true");
  });

  it("filtra al escribir, sin importar tildes ni mayúsculas", async () => {
    const u = userEvent.setup();
    render(<Buscable />);
    await u.type(screen.getByRole("combobox"), "EGANA");
    const opciones = screen.getAllByRole("option");
    expect(opciones).toHaveLength(1);
    expect(opciones[0]).toHaveTextContent("Egaña Centro");
  });

  it("si nada coincide lo dice con lo escrito", async () => {
    const u = userEvent.setup();
    render(<Buscable />);
    await u.type(screen.getByRole("combobox"), "zzz");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Nada coincide con «zzz».")).toBeInTheDocument();
  });

  it("al hacer clic en una opción la elige y cierra la lista", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<Buscable onChange={onChange} />);
    await u.click(screen.getByRole("combobox"));
    await u.click(screen.getByRole("option", { name: /Mall del Sur/ }));
    expect(onChange).toHaveBeenCalledWith("3");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("combobox")).toHaveValue("Mall del Sur");
  });

  it("se maneja con el teclado: flechas, Enter y Escape", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<Buscable onChange={onChange} />);
    const campo = screen.getByRole("combobox");
    await u.click(campo);
    await u.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("2");

    await u.click(campo);
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("un clic fuera cierra la lista y descarta lo tecleado sin elegir", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <Buscable onChange={onChange} inicial="1" />
        <button>afuera</button>
      </div>
    );
    await u.click(screen.getByRole("combobox"));
    await u.type(screen.getByRole("combobox"), "plaza");
    await u.click(screen.getByRole("button", { name: "afuera" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveValue("Egaña Centro");
  });

  it("«Agregar nuevo» solo aparece si el padre lo pide, y entrega lo escrito", async () => {
    const u = userEvent.setup();
    const { unmount } = render(<Buscable />);
    await u.click(screen.getByRole("combobox"));
    expect(screen.queryByText(/Agregar nuevo/)).toBeNull();
    unmount();

    const onAgregar = vi.fn();
    render(<Buscable onAgregar={onAgregar} />);
    await u.click(screen.getByRole("combobox"));
    await u.type(screen.getByRole("combobox"), "Tienda Sur");
    await u.click(screen.getByText(/Agregar nuevo «Tienda Sur»/));
    expect(onAgregar).toHaveBeenCalledWith("Tienda Sur");
  });
});

describe("SelectMultiple", () => {
  function Multiple({ onChange = vi.fn(), inicial = [] as string[] }) {
    const [v, setV] = useState<string[]>(inicial);
    return (
      <div>
        <SelectMultiple
          ariaLabel="Estado"
          valores={v}
          opciones={[
            { v: "A", t: "Programada" },
            { v: "B", t: "Completada" },
            { v: "C", t: "Cancelada" },
          ]}
          textoVacio="Todos los estados"
          onChange={(x) => {
            setV(x);
            onChange(x);
          }}
        />
        <button>afuera</button>
      </div>
    );
  }

  it("con nada marcado dice «Todos…»; con 1-2 lista los nombres y con más cuenta", async () => {
    const u = userEvent.setup();
    render(<Multiple />);
    const boton = screen.getByRole("combobox", { name: "Estado" });
    expect(boton).toHaveTextContent("Todos los estados");
    await u.click(boton);
    await u.click(screen.getByRole("option", { name: /Programada/ }));
    await u.click(screen.getByRole("option", { name: /Completada/ }));
    expect(boton).toHaveTextContent("Programada, Completada");
    await u.click(screen.getByRole("option", { name: /Cancelada/ }));
    expect(boton).toHaveTextContent("3 seleccionados");
  });

  it("entrega lo marcado UNA sola vez, al cerrar (cada cambio de filtro navega)", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<Multiple onChange={onChange} />);
    await u.click(screen.getByRole("combobox", { name: "Estado" }));
    await u.click(screen.getByText("Programada"));
    await u.click(screen.getByText("Cancelada"));
    expect(onChange).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "afuera" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["A", "C"]);
  });

  it("si no cambió nada al cerrar, no dispara el cambio", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<Multiple onChange={onChange} inicial={["B"]} />);
    await u.click(screen.getByRole("combobox", { name: "Estado" }));
    await u.click(screen.getByRole("button", { name: "afuera" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("«Quitar selección» vacía lo marcado y «Aplicar» lo entrega", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<Multiple onChange={onChange} inicial={["A", "B"]} />);
    await u.click(screen.getByRole("combobox", { name: "Estado" }));
    await u.click(screen.getByRole("button", { name: "Quitar selección" }));
    await u.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("la búsqueda solo aparece con 7 opciones o más, y filtra sin importar tildes", async () => {
    const u = userEvent.setup();
    const opciones = Array.from({ length: 8 }, (_, i) => ({ v: String(i), t: i === 3 ? "Región de Ñuble" : `Región ${i}` }));
    const { unmount } = render(
      <SelectMultiple ariaLabel="Zona" valores={[]} opciones={opciones.slice(0, 3)} textoVacio="Todas" onChange={() => undefined} />
    );
    await u.click(screen.getByRole("combobox", { name: "Zona" }));
    expect(screen.queryByPlaceholderText("Escribe para filtrar...")).toBeNull();
    unmount();

    render(<SelectMultiple ariaLabel="Zona" valores={[]} opciones={opciones} textoVacio="Todas" onChange={() => undefined} />);
    await u.click(screen.getByRole("combobox", { name: "Zona" }));
    await u.type(screen.getByPlaceholderText("Escribe para filtrar..."), "nuble");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("Región de Ñuble");
  });
});

describe("SelectConAlta (alta rápida desde el dropdown)", () => {
  const props = { ariaLabel: "Cliente", valor: "", opciones: OPCIONES, onChange: vi.fn() };

  it("sin el permiso de crear no ofrece «Agregar … nuevo»", async () => {
    const u = userEvent.setup();
    pintar(<SelectConAlta {...props} alta="cliente" />, { permisos: ["clientes.ver"] });
    await u.click(screen.getByRole("combobox"));
    expect(screen.queryByText(/Agregar cliente nuevo/)).toBeNull();
  });

  it("con el permiso lo ofrece, y abre el diálogo de alta con lo escrito como sugerencia", async () => {
    const u = userEvent.setup();
    pintar(<SelectConAlta {...props} alta="cliente" />, { permisos: ["clientes.ver", "clientes.crear"] });
    await u.click(screen.getByRole("combobox"));
    await u.type(screen.getByRole("combobox"), "Nueva Empresa");
    await u.click(screen.getByText(/Agregar cliente nuevo «Nueva Empresa»/));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByDisplayValue("Nueva Empresa")).toBeInTheDocument();
  });

  it("el permiso es del tipo de alta: crear mall no habilita agregar sucursales", async () => {
    const u = userEvent.setup();
    pintar(<SelectConAlta {...props} alta="sucursal" />, { permisos: ["malls.crear"] });
    await u.click(screen.getByRole("combobox"));
    expect(screen.queryByText(/Agregar sucursal nueva/)).toBeNull();
  });

  it("sin `alta` se comporta como un SelectBuscable normal", async () => {
    const u = userEvent.setup();
    pintar(<SelectConAlta {...props} />, { permisos: ["clientes.crear"] });
    await u.click(screen.getByRole("combobox"));
    expect(screen.queryByText(/Agregar/)).toBeNull();
  });
});
