import "server-only";
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

  console.error("[dmc] password_hash con formato desconocido en dmc.usuario. Solo se acepta bcrypt.");
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
