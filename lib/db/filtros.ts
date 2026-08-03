import "server-only";

/**
 * Prepara un término de búsqueda para meterlo en un `.or()` de PostgREST.
 *
 * PostgREST separa las condiciones del `or` con comas y agrupa con paréntesis,
 * así que un usuario que escriba "Falabella, S.A." rompe la consulta. Y `%` y
 * `_` son comodines de `ilike`: quien busque "50%" no quiere que el 50 haga de
 * prefijo de cualquier cosa.
 *
 * Los sacamos en vez de escaparlos. En un buscador de razón social ninguno de
 * esos caracteres aporta, y el resultado es una consulta que no se puede
 * torcer desde la URL.
 */
export function limpiarBusqueda(termino: string): string {
  return termino.replace(/[,().*"'\\%_]/g, " ").replace(/\s+/g, " ").trim();
}

/** El filtro activo/inactivo de los listados. `null` = mostrar todos. */
export type FiltroActivo = boolean | null;

/**
 * Traduce `?estado=` a un filtro. Por defecto — sin parámetro — se muestran
 * solo los activos: es lo que se necesita el 95% de las veces.
 */
export function leerFiltroActivo(valor: string): FiltroActivo {
  if (valor === "inactivos") return false;
  if (valor === "todos") return null;
  return true;
}
