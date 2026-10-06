import type { CatalogoMotivo, CatalogoTrabajo } from "@/lib/types";

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

/**
 * Los trabajos que se ofrecen bajo un motivo, en el orden que les dio el
 * checklist dentro de ese motivo. Un trabajo sin el motivo no aparece: desde
 * la migración 019 ya no existe el «sin motivos = en todos».
 */
export function trabajosDelMotivo<T extends Pick<CatalogoTrabajo, "motivosCodigos" | "ordenEnMotivo" | "orden">>(
  catalogo: T[],
  motivoCodigo: string
): T[] {
  const posicion = (t: T) => t.ordenEnMotivo[motivoCodigo] ?? t.orden;
  return catalogo.filter((t) => t.motivosCodigos.includes(motivoCodigo)).sort((a, b) => posicion(a) - posicion(b));
}
