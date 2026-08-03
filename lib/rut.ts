/**
 * RUT chileno.
 *
 * Formato de guardado (el único que va a la base): cuerpo sin puntos, guión y
 * dígito verificador en mayúscula. Ejemplo: `76123456-0`, `12345670-K`.
 * Formato de pantalla: con puntos. Ejemplo: `76.123.456-0`.
 *
 * Guardar normalizado y formatear al mostrar es lo que hace que el índice
 * único de la base funcione: `76.123.456-7` y `76123456-7` son el mismo RUT
 * y Postgres no tiene forma de saberlo si le llegan los dos.
 */

/** Todo lo que no sea dígito o K se descarta. */
function limpiar(valor: string): string {
  return valor.replace(/[^0-9kK]/g, "").toUpperCase();
}

/**
 * Dígito verificador por módulo 11, recorriendo el cuerpo de derecha a
 * izquierda con la serie 2,3,4,5,6,7 que se reinicia.
 */
export function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let multiplo = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }

  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/**
 * Lleva cualquier escritura razonable del RUT al formato de guardado, o
 * devuelve null si no es un RUT válido.
 *
 * Acepta `76.123.456-7`, `76123456-7`, `761234567` y variantes con espacios.
 * Rechaza el dígito verificador equivocado: es el 90% de los errores de tipeo
 * y la base no tiene cómo detectarlo después.
 */
export function normalizarRut(valor: string): string | null {
  const limpio = limpiar(valor);

  // Mínimo 7 caracteres: 6 de cuerpo + verificador. Por debajo de eso no hay
  // RUT real, y por encima de 9 tampoco.
  if (limpio.length < 7 || limpio.length > 9) return null;

  const cuerpo = limpio.slice(0, -1);
  const verificador = limpio.slice(-1);

  // La K solo puede estar en el verificador, nunca en el cuerpo.
  if (!/^\d+$/.test(cuerpo)) return null;

  if (digitoVerificador(cuerpo) !== verificador) return null;

  return `${cuerpo}-${verificador}`;
}

export function esRutValido(valor: string): boolean {
  return normalizarRut(valor) !== null;
}

/**
 * Formato de pantalla, con puntos de miles.
 *
 * Tolerante a propósito: si le llega algo que no parece un RUT lo devuelve tal
 * cual en vez de romper el render. Un dato viejo o importado a mano se ve feo,
 * pero se ve.
 */
export function formatearRut(rut: string): string {
  const limpio = limpiar(rut);
  if (limpio.length < 2) return rut;

  const cuerpo = limpio.slice(0, -1);
  const verificador = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return rut;

  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${conPuntos}-${verificador}`;
}
