import type { CatalogoCargo } from "@/lib/types";

/** El cargo de la persona solo vale si todavía está en el checklist; si no, vacío. */
export function cargoVigente(cargos: CatalogoCargo[], cargo: string | null | undefined): string {
  const buscado = cargo?.trim().toLowerCase();
  if (!buscado) return "";
  return cargos.find((c) => c.nombre.trim().toLowerCase() === buscado)?.nombre ?? "";
}
