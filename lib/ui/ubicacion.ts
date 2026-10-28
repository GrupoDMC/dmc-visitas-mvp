// Dónde está una sucursal: en un mall o a la calle (migración 011 y 029).
//
// El mall es una entidad propia y opcional. Una tienda sin mall está a la
// calle y lo único que la ubica es su dirección.

/** Lo que se escribe donde iría el mall de una tienda que no está en uno. */
export const TEXTO_CALLE = "Calle";

/** El mall de la tienda, o «Calle» si no está en ninguno. */
export function textoMall(mall: { nombre: string } | null | undefined): string {
  return mall?.nombre?.trim() || TEXTO_CALLE;
}

/**
 * Lo que falta para ubicar la tienda, o null si está lista. Con mall la
 * dirección es la del mall; a la calle necesita la suya.
 */
export function problemaDeUbicacion(u: { mallId: number | null; direccion: string }): string | null {
  if (u.mallId !== null) return null;
  return u.direccion.trim() ? null : "Una sucursal sin mall necesita su dirección de calle.";
}
