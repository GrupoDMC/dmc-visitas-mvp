import type { Visita } from "@/lib/types";

/** Tope del nombre sin la extensión: Windows admite 255, pero la ruta completa también cuenta. */
const LARGO_MAXIMO = 150;

/** Nombres que Windows reserva a dispositivos, con o sin extensión. */
const RESERVADOS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** Quita lo que Windows no admite en un nombre de archivo y los saltos de línea. */
function limpio(s: string | undefined | null): string {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * El nombre del PDF del acta: «Razón social - Sucursal.pdf», con la razón
 * social del cliente y el nombre de la sucursal tal como se escribió en el
 * sistema. Lo usan el servidor (Content-Disposition) y los enlaces de
 * descarga, para que coincida.
 *
 * Sin razón social se usa el nombre de fantasía; sin nada que nombrar, el folio.
 */
export function nombreArchivoActa(visita: Pick<Visita, "folio" | "sucursal" | "cliente">): string {
  const cliente = limpio(visita.cliente?.razonSocial) || limpio(visita.cliente?.nombreFantasia);
  const partes = [cliente, limpio(visita.sucursal?.nombre)].filter(Boolean);
  if (!partes.length) partes.push(limpio(`Acta ${visita.folio ?? ""}`));
  // Por puntos de código, para no partir un carácter en dos. Windows tampoco
  // admite un nombre que termine en punto o espacio.
  let base = Array.from(partes.join(" - ")).slice(0, LARGO_MAXIMO).join("").replace(/[\s.-]+$/, "");
  if (RESERVADOS.test(base)) base = `${base}_`;
  return `${base || "Acta"}.pdf`;
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
