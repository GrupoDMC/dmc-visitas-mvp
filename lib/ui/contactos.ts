import { sinTildes } from "@/lib/ui/formato";
import { REGIONES } from "@/lib/ui/regiones";

// Contactos con cargos y alcances (migración 029).
//
// Un contacto puede tener varios cargos y cada cargo vale para un alcance: un
// cliente, una marca, una región o una sucursal. A una tienda le aplican los
// cargos cuyo alcance la contiene: los de la propia sucursal y, heredados, los
// de su marca, su región y su cliente. (La zona queda para más adelante.)
//
// Puro y sin base de datos: la ficha, la capa de datos y los tests lo usan igual.

/** De más a menos específico: el orden en que se listan los contactos de una tienda. */
export const ALCANCES = ["SUCURSAL", "MARCA", "REGION", "CLIENTE"] as const;
export type AlcanceTipo = (typeof ALCANCES)[number];

export const ETIQUETA_ALCANCE: Record<AlcanceTipo, string> = {
  SUCURSAL: "Sucursal",
  MARCA: "Marca",
  REGION: "Región",
  CLIENTE: "Cliente",
};

export interface CargoContacto {
  /** null en un cargo que todavía no se guardó. */
  id: number | null;
  cargo: string;
  alcanceTipo: AlcanceTipo;
  /** Cliente, marca o sucursal. null cuando el alcance es una región. */
  alcanceId: number | null;
  /** La región, escrita como en `REGIONES`. null en los demás alcances. */
  alcanceTexto: string | null;
}

export interface Contacto {
  id: number;
  nombre: string;
  email: string | null;
  telefono: string | null;
  activo: boolean;
  cargos: CargoContacto[];
}

/** Lo que hay que saber de una tienda para decidir qué contactos le tocan. */
export interface UbicacionTienda {
  id: number;
  clienteId: number;
  marcaId: number;
  region: string;
}

/** ¿Este cargo cubre a esa tienda? */
export function cargoAplica(cargo: CargoContacto, tienda: UbicacionTienda): boolean {
  switch (cargo.alcanceTipo) {
    case "SUCURSAL":
      return cargo.alcanceId === tienda.id;
    case "MARCA":
      return cargo.alcanceId === tienda.marcaId;
    case "CLIENTE":
      return cargo.alcanceId === tienda.clienteId;
    case "REGION":
      return !!cargo.alcanceTexto && sinTildes(cargo.alcanceTexto.trim()) === sinTildes(tienda.region.trim());
    default:
      return false;
  }
}

/** Un contacto en la lista de una tienda, con el cargo por el que le toca y de dónde viene. */
export interface ContactoAplicable {
  contacto: Contacto;
  cargo: CargoContacto;
  /** Igual a `cargo.alcanceTipo`: de dónde viene. SUCURSAL = propio; el resto, heredado. */
  origen: AlcanceTipo;
  heredado: boolean;
}

/**
 * Los contactos que aplican a una tienda: los propios y los heredados de su
 * marca, región y cliente. Un contacto con dos cargos que la cubren sale dos
 * veces, una por cargo. Los inactivos no salen. De más a menos específico y,
 * dentro de cada nivel, por nombre.
 */
export function contactosDeTienda(contactos: readonly Contacto[], tienda: UbicacionTienda): ContactoAplicable[] {
  const lista: ContactoAplicable[] = [];
  for (const contacto of contactos) {
    if (!contacto.activo) continue;
    for (const cargo of contacto.cargos) {
      if (cargoAplica(cargo, tienda)) {
        lista.push({ contacto, cargo, origen: cargo.alcanceTipo, heredado: cargo.alcanceTipo !== "SUCURSAL" });
      }
    }
  }
  return lista.sort(
    (a, b) =>
      ALCANCES.indexOf(a.origen) - ALCANCES.indexOf(b.origen) ||
      a.contacto.nombre.localeCompare(b.contacto.nombre, "es") ||
      a.cargo.cargo.localeCompare(b.cargo.cargo, "es")
  );
}

/** Los nombres con que se escribe un alcance: cliente, marca y sucursal por id. */
export interface NombresAlcance {
  cliente: (id: number) => string | undefined;
  marca: (id: number) => string | undefined;
  sucursal: (id: number) => string | undefined;
}

/** «Marca Volcom», «Región Metropolitana», «Sucursal Parque Arauco». */
export function describirAlcance(cargo: Pick<CargoContacto, "alcanceTipo" | "alcanceId" | "alcanceTexto">, nombres: NombresAlcance): string {
  const etiqueta = ETIQUETA_ALCANCE[cargo.alcanceTipo];
  let nombre: string | undefined;
  if (cargo.alcanceTipo === "REGION") nombre = cargo.alcanceTexto ?? undefined;
  else if (cargo.alcanceId !== null) {
    nombre =
      cargo.alcanceTipo === "CLIENTE"
        ? nombres.cliente(cargo.alcanceId)
        : cargo.alcanceTipo === "MARCA"
          ? nombres.marca(cargo.alcanceId)
          : nombres.sucursal(cargo.alcanceId);
  }
  return `${etiqueta} ${nombre ?? "(ya no existe)"}`;
}

/** «Heredado de la marca Volcom» / «Propio de la sucursal». */
export function origenDe(a: ContactoAplicable, nombres: NombresAlcance): string {
  if (!a.heredado) return "Propio de la sucursal";
  const de = a.origen === "REGION" ? "de la región" : a.origen === "MARCA" ? "de la marca" : "del cliente";
  const quien = describirAlcance(a.cargo, nombres).replace(`${ETIQUETA_ALCANCE[a.origen]} `, "");
  return `Heredado ${de} ${quien}`;
}

/**
 * El texto del primer problema de los cargos de un contacto, o null si están
 * bien: cada uno con su nombre y un alcance coherente, sin repetidos, y la
 * región tiene que ser una de las 16.
 */
export function problemaDeCargos(cargos: readonly Pick<CargoContacto, "cargo" | "alcanceTipo" | "alcanceId" | "alcanceTexto">[]): string | null {
  const vistos = new Set<string>();
  for (const [i, c] of cargos.entries()) {
    const cual = `Cargo ${i + 1}`;
    if (!c.cargo.trim()) return `${cual}: escribe el cargo.`;
    if (!ALCANCES.includes(c.alcanceTipo)) return `${cual}: el alcance no es válido.`;
    if (c.alcanceTipo === "REGION") {
      if (!c.alcanceTexto || !REGIONES.includes(c.alcanceTexto)) return `${cual}: elige la región.`;
      if (c.alcanceId !== null) return `${cual}: una región no lleva id.`;
    } else {
      if (c.alcanceId === null || !Number.isInteger(c.alcanceId) || c.alcanceId <= 0) {
        return `${cual}: elige ${c.alcanceTipo === "SUCURSAL" ? "la sucursal" : c.alcanceTipo === "MARCA" ? "la marca" : "el cliente"}.`;
      }
      if (c.alcanceTexto) return `${cual}: ese alcance no lleva texto.`;
    }
    const clave = [sinTildes(c.cargo.trim()), c.alcanceTipo, c.alcanceId ?? "", sinTildes(c.alcanceTexto ?? "")].join("|");
    if (vistos.has(clave)) return `${cual}: «${c.cargo.trim()}» está repetido con el mismo alcance.`;
    vistos.add(clave);
  }
  return null;
}
