import type { Visita } from "@/lib/types";

/** Tope del nombre sin la extensión: Windows admite 255, pero la ruta completa también cuenta. */
const LARGO_MAXIMO = 150;

/** Nombres que Windows reserva a dispositivos, con o sin extensión. */
const RESERVADOS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** Quita lo que Windows no admite en un nombre de archivo y los saltos de línea. */
export function sanearNombre(s: string | undefined | null): string {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Recorta por puntos de código, para no partir un carácter en dos. Windows
 * tampoco admite un nombre que termine en punto o espacio, ni los reservados.
 */
export function acotarNombre(s: string, largo = LARGO_MAXIMO): string {
  const base = Array.from(s).slice(0, largo).join("").replace(/[\s.-]+$/, "");
  return RESERVADOS.test(base) ? `${base}_` : base;
}

type DatosNombre = Pick<Visita, "folio" | "sucursal" | "cliente">;

/** «Razón social - Sucursal», sin extensión. Sin razón social, el nombre de fantasía; sin nada, el folio. */
function baseNombreActa(visita: DatosNombre): string {
  const cliente = sanearNombre(visita.cliente?.razonSocial) || sanearNombre(visita.cliente?.nombreFantasia);
  const partes = [cliente, sanearNombre(visita.sucursal?.nombre)].filter(Boolean);
  if (!partes.length) partes.push(sanearNombre(`Acta ${visita.folio ?? ""}`));
  return acotarNombre(partes.join(" - ")) || "Acta";
}

/**
 * El nombre del PDF del acta: «Razón social - Sucursal.pdf», con la razón
 * social del cliente y el nombre de la sucursal tal como se escribió en el
 * sistema. Lo usan el servidor (Content-Disposition), los enlaces de descarga
 * y el .zip de actas, para que coincida.
 */
export function nombreArchivoActa(visita: DatosNombre): string {
  return `${baseNombreActa(visita)}.pdf`;
}

/** La carpeta del local en el .zip de actas: el nombre de la sucursal; sin él, el del PDF. */
export function nombreCarpetaLocal(visita: DatosNombre): string {
  return acotarNombre(sanearNombre(visita.sucursal?.nombre), 100) || baseNombreActa(visita);
}

/**
 * Quita de `nombres` las repeticiones: la segunda vez que aparece uno queda
 * «nombre (2)», la tercera «nombre (3)». Windows no distingue mayúsculas, así
 * que «Local» y «LOCAL» chocan. El sufijo va antes de la extensión si `conExtension`.
 */
export function nombresSinColision(nombres: string[], conExtension = false): string[] {
  const usados = new Set<string>();
  return nombres.map((n) => {
    const punto = conExtension ? n.lastIndexOf(".") : -1;
    const [raiz, ext] = punto > 0 ? [n.slice(0, punto), n.slice(punto)] : [n, ""];
    let candidato = n;
    for (let i = 2; usados.has(candidato.toLowerCase()); i++) candidato = `${raiz} (${i})${ext}`;
    usados.add(candidato.toLowerCase());
    return candidato;
  });
}

/**
 * El Content-Disposition de una descarga: `filename` en ASCII para los
 * clientes viejos y `filename*` en UTF-8 (RFC 6266) con las tildes y la ñ.
 * Espera un nombre ya saneado, como el de nombreArchivoActa.
 */
export function dispositionAdjunto(nombre: string): string {
  const ascii = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  // encodeURIComponent deja ' ( ) * sin codificar, y RFC 5987 no los admite.
  const utf8 = encodeURIComponent(nombre).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
