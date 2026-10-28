import { describe, expect, it } from "vitest";
import {
  cargoAplica,
  contactosDeTienda,
  describirAlcance,
  origenDe,
  problemaDeCargos,
  type CargoContacto,
  type Contacto,
  type NombresAlcance,
  type UbicacionTienda,
} from "@/lib/ui/contactos";
import { TEXTO_CALLE, problemaDeUbicacion, textoMall } from "@/lib/ui/ubicacion";

// Una tienda de la marca 20, del cliente 1, en la Región Metropolitana.
const tienda: UbicacionTienda = { id: 100, clienteId: 1, marcaId: 20, region: "Metropolitana" };

const cargo = (c: Partial<CargoContacto> & Pick<CargoContacto, "alcanceTipo">): CargoContacto => ({
  id: null,
  cargo: "Jefe",
  alcanceId: null,
  alcanceTexto: null,
  ...c,
});

const contacto = (id: number, nombre: string, cargos: CargoContacto[], activo = true): Contacto => ({
  id,
  nombre,
  email: null,
  telefono: null,
  activo,
  cargos,
});

describe("cargoAplica — qué cubre cada alcance", () => {
  it("la sucursal solo cubre a esa sucursal", () => {
    expect(cargoAplica(cargo({ alcanceTipo: "SUCURSAL", alcanceId: 100 }), tienda)).toBe(true);
    expect(cargoAplica(cargo({ alcanceTipo: "SUCURSAL", alcanceId: 101 }), tienda)).toBe(false);
  });

  it("la marca cubre a todas sus tiendas, y no a las de otra marca del mismo cliente", () => {
    expect(cargoAplica(cargo({ alcanceTipo: "MARCA", alcanceId: 20 }), tienda)).toBe(true);
    expect(cargoAplica(cargo({ alcanceTipo: "MARCA", alcanceId: 21 }), tienda)).toBe(false);
  });

  it("el cliente cubre a todas las tiendas de todas sus marcas", () => {
    expect(cargoAplica(cargo({ alcanceTipo: "CLIENTE", alcanceId: 1 }), tienda)).toBe(true);
    expect(cargoAplica(cargo({ alcanceTipo: "CLIENTE", alcanceId: 2 }), tienda)).toBe(false);
  });

  it("la región se compara por su nombre, sin tildes ni mayúsculas", () => {
    expect(cargoAplica(cargo({ alcanceTipo: "REGION", alcanceTexto: "Metropolitana" }), tienda)).toBe(true);
    expect(cargoAplica(cargo({ alcanceTipo: "REGION", alcanceTexto: "metropolitana " }), tienda)).toBe(true);
    expect(cargoAplica(cargo({ alcanceTipo: "REGION", alcanceTexto: "Valparaíso" }), tienda)).toBe(false);
    expect(
      cargoAplica(cargo({ alcanceTipo: "REGION", alcanceTexto: "VALPARAISO" }), { ...tienda, region: "Valparaíso" })
    ).toBe(true);
  });
});

describe("contactosDeTienda — herencia", () => {
  const propio = contacto(1, "Ana", [cargo({ alcanceTipo: "SUCURSAL", alcanceId: 100, cargo: "Encargada" })]);
  const deMarca = contacto(2, "Beto", [cargo({ alcanceTipo: "MARCA", alcanceId: 20, cargo: "Gerente de marca" })]);
  const deRegion = contacto(3, "Carla", [cargo({ alcanceTipo: "REGION", alcanceTexto: "Metropolitana", cargo: "Supervisora" })]);
  const deCliente = contacto(4, "Dani", [cargo({ alcanceTipo: "CLIENTE", alcanceId: 1, cargo: "Gerente general" })]);
  const ajeno = contacto(5, "Eva", [
    cargo({ alcanceTipo: "SUCURSAL", alcanceId: 999 }),
    cargo({ alcanceTipo: "MARCA", alcanceId: 21 }),
    cargo({ alcanceTipo: "CLIENTE", alcanceId: 2 }),
    cargo({ alcanceTipo: "REGION", alcanceTexto: "Biobío" }),
  ]);

  it("lista los propios y los heredados de marca, región y cliente, y deja fuera los ajenos", () => {
    const lista = contactosDeTienda([ajeno, deCliente, deRegion, deMarca, propio], tienda);
    expect(lista.map((a) => a.contacto.nombre)).toEqual(["Ana", "Beto", "Carla", "Dani"]);
  });

  it("indica de dónde viene cada uno: propio o heredado", () => {
    const lista = contactosDeTienda([propio, deMarca, deRegion, deCliente], tienda);
    expect(lista.map((a) => [a.origen, a.heredado])).toEqual([
      ["SUCURSAL", false],
      ["MARCA", true],
      ["REGION", true],
      ["CLIENTE", true],
    ]);
  });

  it("ordena de lo más específico a lo más general, y por nombre dentro de cada nivel", () => {
    const otraDeMarca = contacto(6, "Abel", [cargo({ alcanceTipo: "MARCA", alcanceId: 20 })]);
    const lista = contactosDeTienda([deCliente, deMarca, otraDeMarca, propio], tienda);
    expect(lista.map((a) => a.contacto.nombre)).toEqual(["Ana", "Abel", "Beto", "Dani"]);
  });

  it("un contacto con varios cargos aparece una vez por cada cargo que cubre a la tienda", () => {
    const varios = contacto(7, "Fede", [
      cargo({ alcanceTipo: "MARCA", alcanceId: 20, cargo: "Gerente de marca" }),
      cargo({ alcanceTipo: "REGION", alcanceTexto: "Metropolitana", cargo: "Supervisor" }),
      cargo({ alcanceTipo: "MARCA", alcanceId: 21, cargo: "Gerente de otra marca" }),
    ]);
    const lista = contactosDeTienda([varios], tienda);
    expect(lista.map((a) => a.cargo.cargo)).toEqual(["Gerente de marca", "Supervisor"]);
  });

  it("no incluye contactos inactivos", () => {
    const inactivo = contacto(8, "Gus", [cargo({ alcanceTipo: "CLIENTE", alcanceId: 1 })], false);
    expect(contactosDeTienda([inactivo], tienda)).toEqual([]);
  });

  it("una tienda sin contactos da una lista vacía", () => {
    expect(contactosDeTienda([], tienda)).toEqual([]);
  });
});

describe("textos del origen", () => {
  const nombres: NombresAlcance = {
    cliente: (id) => (id === 1 ? "Maui" : undefined),
    marca: (id) => (id === 20 ? "Volcom" : undefined),
    sucursal: (id) => (id === 100 ? "Parque Arauco" : undefined),
  };
  const aplicable = (c: CargoContacto) => contactosDeTienda([contacto(1, "Ana", [c])], tienda)[0];

  it("describe el alcance con su nombre", () => {
    expect(describirAlcance(cargo({ alcanceTipo: "MARCA", alcanceId: 20 }), nombres)).toBe("Marca Volcom");
    expect(describirAlcance(cargo({ alcanceTipo: "REGION", alcanceTexto: "Metropolitana" }), nombres)).toBe("Región Metropolitana");
    expect(describirAlcance(cargo({ alcanceTipo: "CLIENTE", alcanceId: 9 }), nombres)).toBe("Cliente (ya no existe)");
  });

  it("dice si es propio o de dónde se hereda", () => {
    expect(origenDe(aplicable(cargo({ alcanceTipo: "SUCURSAL", alcanceId: 100 })), nombres)).toBe("Propio de la sucursal");
    expect(origenDe(aplicable(cargo({ alcanceTipo: "MARCA", alcanceId: 20 })), nombres)).toBe("Heredado de la marca Volcom");
    expect(origenDe(aplicable(cargo({ alcanceTipo: "CLIENTE", alcanceId: 1 })), nombres)).toBe("Heredado del cliente Maui");
    expect(origenDe(aplicable(cargo({ alcanceTipo: "REGION", alcanceTexto: "Metropolitana" })), nombres)).toBe(
      "Heredado de la región Metropolitana"
    );
  });
});

describe("problemaDeCargos", () => {
  it("acepta cargos bien formados, uno por alcance", () => {
    expect(
      problemaDeCargos([
        cargo({ alcanceTipo: "MARCA", alcanceId: 20 }),
        cargo({ alcanceTipo: "REGION", alcanceTexto: "Metropolitana" }),
        cargo({ alcanceTipo: "MARCA", alcanceId: 21 }),
      ])
    ).toBeNull();
  });

  it("pide el nombre del cargo y el alcance", () => {
    expect(problemaDeCargos([cargo({ alcanceTipo: "MARCA", alcanceId: 20, cargo: "  " })])).toMatch(/escribe el cargo/);
    expect(problemaDeCargos([cargo({ alcanceTipo: "CLIENTE", alcanceId: null })])).toMatch(/elige el cliente/);
    expect(problemaDeCargos([cargo({ alcanceTipo: "REGION", alcanceTexto: "Mordor" })])).toMatch(/elige la región/);
  });

  it("rechaza el mismo cargo con el mismo alcance dos veces", () => {
    expect(
      problemaDeCargos([cargo({ alcanceTipo: "MARCA", alcanceId: 20 }), cargo({ alcanceTipo: "MARCA", alcanceId: 20, cargo: "JEFE" })])
    ).toMatch(/repetido/);
  });
});

describe("mall opcional", () => {
  it("una tienda sin mall figura como «Calle»", () => {
    expect(textoMall(null)).toBe(TEXTO_CALLE);
    expect(textoMall(undefined)).toBe("Calle");
    expect(textoMall({ nombre: "  " })).toBe("Calle");
    expect(textoMall({ nombre: "Parque Arauco" })).toBe("Parque Arauco");
  });

  it("con mall no hace falta dirección propia; a la calle sí", () => {
    expect(problemaDeUbicacion({ mallId: 5, direccion: "" })).toBeNull();
    expect(problemaDeUbicacion({ mallId: null, direccion: "Av. Siempre Viva 742" })).toBeNull();
    expect(problemaDeUbicacion({ mallId: null, direccion: "   " })).toMatch(/dirección de calle/);
  });
});
