import "server-only";

import { randomInt } from "crypto";

/**
 * Contraseña temporal para dictar por teléfono.
 *
 * Sin caracteres que se confunden al escucharlos o leerlos en voz alta:
 * 0/O, 1/l/I quedan afuera. Con `crypto.randomInt` y no `Math.random`, que no
 * es apto para nada que haga de contraseña aunque sea temporal.
 */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generarClaveTemporal(longitud = 10): string {
  let clave = "";
  for (let i = 0; i < longitud; i++) {
    clave += ALFABETO[randomInt(ALFABETO.length)];
  }
  return clave;
}
