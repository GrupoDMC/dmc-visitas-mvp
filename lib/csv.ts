import "server-only";

/**
 * CSV con BOM UTF-8 y separador punto y coma — así lo abre Excel en Windows
 * sin romper las tildes ni partir columnas por las comas de los decimales.
 *
 * Las columnas salen crudas: lo que venga de Supabase (fechas ISO 8601,
 * booleanos, números) se vuelca tal cual, sin formatear a texto bonito. Este
 * export es para el traspaso a SQL Server, no para leer en pantalla.
 */
const BOM = String.fromCharCode(0xfeff);
const SEPARADOR = ";";

function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  if (/["\n\r;]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export type ColumnaCsv<T> = { clave: keyof T; encabezado: string };

export function armarCsv<T extends Record<string, unknown>>(
  columnas: ColumnaCsv<T>[],
  filas: T[],
): string {
  const cabecera = columnas.map((c) => celda(c.encabezado)).join(SEPARADOR);
  const cuerpo = filas.map((fila) =>
    columnas.map((c) => celda(fila[c.clave])).join(SEPARADOR),
  );
  return BOM + [cabecera, ...cuerpo].join("\r\n");
}

/**
 * Nombre de archivo con la fecha de hoy en Chile, para no pisar la descarga
 * anterior. `en-CA` da el formato `yyyy-mm-dd` directo, sin partir la cadena.
 */
export function nombreArchivoCsv(base: string): string {
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
  return `${base}_${hoy}.csv`;
}
