import { sinTildes } from "@/lib/ui/formato";

/**
 * La dirección sin tildes, mayúsculas, puntuación ni espacios de más:
 * «Av. Vicuña  Mackenna #7110» y «av vicuna mackenna 7110» son la misma.
 */
export function normalizarDireccion(direccion: string): string {
  return sinTildes(direccion)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** El primero de `existentes` que tiene la misma dirección que `direccion`, o null. */
export function conMismaDireccion<T extends { direccion: string; comuna?: string | null }>(
  existentes: T[],
  direccion: string,
  comuna?: string
): T | null {
  const buscada = normalizarDireccion(direccion);
  if (!buscada) return null;
  const comunaBuscada = normalizarDireccion(comuna ?? "");
  return (
    existentes.find((e) => {
      if (normalizarDireccion(e.direccion) !== buscada) return false;
      // La misma calle y número en otra comuna es otro lugar.
      const suya = normalizarDireccion(e.comuna ?? "");
      return !comunaBuscada || !suya || comunaBuscada === suya;
    }) ?? null
  );
}
