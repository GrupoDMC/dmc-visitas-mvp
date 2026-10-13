import "server-only";
import { log } from "@/lib/log";
import bcrypt from "bcryptjs";

// Verificación de contraseñas contra dmc.usuario.password_hash.
//
// Formato: bcrypt ($2a$/$2b$/$2y$). Es el que genera la app.
// Solo se acepta bcrypt.

const COSTO_BCRYPT = 12;

export function esHashBcrypt(hash: string): boolean {
  return /^\$2[aby]\$/.test(hash);
}

export async function hashearPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COSTO_BCRYPT);
}

/** true si la contraseña corresponde al hash almacenado. */
export async function verificarPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;

  if (esHashBcrypt(hash)) {
    return bcrypt.compare(password, hash);
  }

  log.error("password_hash con formato desconocido en dmc.usuario: solo se acepta bcrypt");
  return false;
}

// Hash de relleno, con el mismo costo que los reales. No corresponde a
// ninguna contraseña en uso: solo sirve para gastar el tiempo de un bcrypt.
const HASH_SENUELO = "$2b$12$hHGjJNshg8qdbMn/ZPXi/OfEyZD4UYxYvTOYVkv62NwPm0GZtHs5e";

/**
 * Contramedida contra la enumeración de usuarios: cuando el correo no existe
 * hay que gastar el mismo tiempo que gastaría comparar un hash real, o la
 * diferencia de latencia delata qué correos están dados de alta.
 */
export async function gastarTiempoDeVerificacion(): Promise<void> {
  try {
    await bcrypt.compare("contraseña-inexistente", HASH_SENUELO);
  } catch {
    // Da igual el resultado: lo único que importa es haber gastado el tiempo.
  }
}

// ── Política de contraseñas nuevas ──────────────────────────────────────────
//
// Vale para todos los caminos que ponen una clave: alta y edición de usuarios,
// la clave temporal de una solicitud y el cambio obligatorio al entrar. La
// contraseña NUNCA se recorta: un espacio al final es parte de la clave, y
// recortarla en un camino y no en otro deja cuentas con una clave que nadie
// sabe escribir. Solo se rechaza la que queda vacía.

export const LARGO_MINIMO_PASSWORD = 10;

/** bcrypt solo mira los primeros 72 bytes: lo que siga no protege nada. */
const BYTES_MAXIMOS_PASSWORD = 72;

/** Las más repetidas en filtraciones, más las obvias para este sistema. */
const PASSWORDS_COMUNES = new Set([
  "1234567890",
  "0123456789",
  "12345678910",
  "123456789a",
  "1q2w3e4r5t",
  "1qaz2wsx3edc",
  "qwertyuiop",
  "asdfghjkl1",
  "password12",
  "password123",
  "contraseña",
  "contraseña1",
  "contraseña123",
  "contrasena",
  "contrasena1",
  "contrasena123",
  "iloveyou12",
  "abcdefghij",
  "abc1234567",
  "qwerty1234",
  "qwerty123456",
  "aaaaaaaaaa",
  "1111111111",
  "0000000000",
  "bienvenido",
  "bienvenido1",
  "bienvenido123",
  "temporal123",
  "cambiame123",
  "dmc1234567",
  "grupodmc123",
  "grupodmc2026",
  "contingencia",
]);

/**
 * Devuelve por qué no sirve la contraseña, o null si se puede usar. `email` es
 * el de la cuenta que la va a tener.
 */
export function validarPasswordNueva(password: string, email: string): string | null {
  if (!password.trim()) return "La contraseña no puede quedar vacía.";
  if (password.length < LARGO_MINIMO_PASSWORD) {
    return `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`;
  }
  if (new TextEncoder().encode(password).length > BYTES_MAXIMOS_PASSWORD) {
    return "La contraseña es demasiado larga (máximo 72 caracteres).";
  }
  const minuscula = password.toLowerCase();
  const correo = email.trim().toLowerCase();
  const usuario = correo.split("@")[0];
  if (minuscula === correo || (usuario && minuscula === usuario)) {
    return "La contraseña no puede ser el correo.";
  }
  if (PASSWORDS_COMUNES.has(minuscula) || new Set(minuscula).size <= 2) {
    return "Esa contraseña es demasiado fácil de adivinar. Elige otra.";
  }
  return null;
}
