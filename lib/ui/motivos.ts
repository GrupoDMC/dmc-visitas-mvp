import type { CatalogoMotivo } from "@/lib/types";

/**
 * Qué motivos obligan a poner hora al agendar: las instalaciones, y nada más.
 *
 * Antes se miraba el código INSTALACION, pero el código es fijo y el nombre se
 * edita en el checklist: esa fila terminó llamándose «Visita preventiva
 * Antenas» y pasó a pedir hora, mientras la instalación de verdad —creada
 * después con otro código— no la pedía. Por eso ahora manda el nombre: todo lo
 * que empiece con «Instalación» (antenas, portillones, contadores, muebles…).
 * Reinstalación y desinstalación no cuentan.
 */
export function motivoPideHora(nombre: string | null | undefined): boolean {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .startsWith("instalacion");
}

/** Basta con que uno de los motivos marcados sea una instalación. */
export function algunoPideHora(codigos: string[], catalogo: Pick<CatalogoMotivo, "codigo" | "nombre">[]): boolean {
  return codigos.some((codigo) => motivoPideHora(catalogo.find((m) => m.codigo === codigo)?.nombre));
}
