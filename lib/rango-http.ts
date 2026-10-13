// Cabecera Range de la ruta de video. Lógica pura, sin SQL: se prueba sola.

// Cuánto se manda como máximo por respuesta. El tope existe porque la
// respuesta de una función serverless también está acotada: si el cliente pide
// "bytes=0-" sobre un clip de 11 MB y se le manda entero, la petición muere. Se
// le devuelve el primer tramo con su Content-Range y el reproductor sigue
// pidiendo lo que falta.
export const TRAMO_MAXIMO = 2 * 1024 * 1024;

export type Rango = { desde: number; hasta: number } | "invalido" | null;

/**
 * "bytes=0-" / "bytes=1048576-2097151" → posiciones. null si no hay rango (o no
 * se entiende, y entonces se ignora); "invalido" si cae fuera del archivo.
 * El tramo siempre se recorta a TRAMO_MAXIMO, tenga o no final explícito.
 */
export function leerRango(cabecera: string | null, total: number): Rango {
  const m = /^bytes=(\d*)-(\d*)$/.exec((cabecera ?? "").trim());
  if (!m) return null;
  const [, a, b] = m;
  if (!a && !b) return null;
  if (total <= 0) return "invalido";

  // "bytes=-500" son los últimos 500 bytes.
  if (!a) {
    const largo = Math.min(Number(b), total);
    if (largo <= 0) return "invalido";
    const desde = Math.max(0, total - largo);
    return { desde, hasta: Math.min(total - 1, desde + TRAMO_MAXIMO - 1) };
  }
  const desde = Number(a);
  if (!Number.isSafeInteger(desde) || desde >= total) return "invalido";
  const pedido = b ? Number(b) : total - 1;
  if (!Number.isSafeInteger(pedido) || pedido < desde) return "invalido";
  return { desde, hasta: Math.min(pedido, total - 1, desde + TRAMO_MAXIMO - 1) };
}
