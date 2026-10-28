import type { Visita } from "@/lib/types";

/**
 * El nombre del PDF del acta: «Acta V-0123 - Tienda - Cliente.pdf». Lo usan el
 * servidor (Content-Disposition) y los enlaces de descarga, para que coincida.
 */
export function nombreArchivoActa(visita: Pick<Visita, "folio" | "sucursal" | "cliente">): string {
  const limpio = (s: string | undefined | null) =>
    String(s ?? "")
      .replace(/[\/:*?"<>|\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const partes = [`Acta ${limpio(visita.folio)}`, limpio(visita.sucursal?.nombre), limpio(visita.cliente?.nombreFantasia)];
  return `${partes.filter(Boolean).join(" - ").slice(0, 150).trim()}.pdf`;
}
