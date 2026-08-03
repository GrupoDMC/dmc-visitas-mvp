/** Todos los listados de la app paginan igual. */
export const POR_PAGINA = 25;

export type Pagina<T> = {
  filas: T[];
  total: number;
  pagina: number;
  paginas: number;
};

/**
 * Lee `?pagina=` de la URL. Cualquier basura cae en 1: la paginación no es
 * lugar para mostrar un error, es lugar para mostrar la primera página.
 */
export function leerPagina(valor: string | string[] | undefined): number {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  const numero = Number(crudo);
  if (!Number.isInteger(numero) || numero < 1) return 1;
  return numero;
}

/** Rango [desde, hasta] inclusivo, que es lo que espera `.range()` de Supabase. */
export function rango(pagina: number): { desde: number; hasta: number } {
  const desde = (pagina - 1) * POR_PAGINA;
  return { desde, hasta: desde + POR_PAGINA - 1 };
}

export function totalPaginas(total: number): number {
  return Math.max(1, Math.ceil(total / POR_PAGINA));
}

/** Primer valor de un search param que puede venir repetido en la URL. */
export function unico(valor: string | string[] | undefined): string {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  return typeof crudo === "string" ? crudo.trim() : "";
}
