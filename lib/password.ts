import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

// Verificación de contraseñas contra dmc.usuario.password_hash.
//
// Formato vigente: bcrypt ($2a$/$2b$/$2y$). Es el que genera la app.
//
// Formato heredado: "sha512$<hex>", el que siembra la sección 12 del DDL con
// HASHBYTES('SHA2_512', N'...'). Es un digest sin sal ni coste: se acepta para
// no dejar fuera a los usuarios ya sembrados, pero en cuanto uno acierta su
// contraseña el hash se reescribe en bcrypt (ver migrarHashSiHaceFalta).

const COSTO_BCRYPT = 12;
const PREFIJO_LEGADO = "sha512$";

export function esHashBcrypt(hash: string): boolean {
  return /^\$2[aby]\$/.test(hash);
}

export function esHashLegado(hash: string): boolean {
  return hash.startsWith(PREFIJO_LEGADO);
}

export async function hashearPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COSTO_BCRYPT);
}

function comparaLegado(password: string, hash: string): boolean {
  // El DDL hashea un literal N'...', es decir los bytes UTF-16LE del texto.
  const esperado = Buffer.from(hash.slice(PREFIJO_LEGADO.length).toLowerCase(), "hex");
  const calculado = createHash("sha512").update(Buffer.from(password, "utf16le")).digest();
  if (esperado.length !== calculado.length) return false;
  return timingSafeEqual(esperado, calculado);
}

/** true si la contraseña corresponde al hash almacenado. */
export async function verificarPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;

  if (esHashBcrypt(hash)) {
    return bcrypt.compare(password, hash);
  }

  if (esHashLegado(hash)) {
    console.warn(
      "[dmc] Un usuario tiene todavía el hash SHA-512 sin sal del DDL de ejemplo. Se reescribirá a bcrypt en este inicio de sesión."
    );
    try {
      return comparaLegado(password, hash);
    } catch {
      return false;
    }
  }

  console.error("[dmc] password_hash con formato desconocido en dmc.usuario. Solo se aceptan bcrypt y sha512$<hex>.");
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
