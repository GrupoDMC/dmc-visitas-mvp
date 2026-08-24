import "server-only";
import { cookies } from "next/headers";
import { COOKIE_SESION, VIGENCIA_SESION, firmarToken, opcionesCookie, verificarToken } from "@/lib/session";
import { esHashLegado, gastarTiempoDeVerificacion, hashearPassword, verificarPassword } from "@/lib/password";
import {
  actualizarPasswordHash,
  getUsuarioPorEmail,
  getUsuarioPorId,
  registrarAcceso,
} from "@/lib/data/usuarios";
import type { Tecnico, Usuario } from "@/lib/types";

export interface Sesion {
  usuario: Usuario;
  tecnico: Tecnico | null;
}

/**
 * Valida credenciales contra dmc.usuario. Devuelve null ante cualquier
 * fallo —correo desconocido, contraseña mala, usuario inactivo— sin distinguir
 * cuál: quien intenta entrar no tiene por qué saber qué correos existen.
 */
export async function autenticar(email: string, password: string): Promise<Usuario | null> {
  const normalizado = email.trim().toLowerCase();

  const registro = await getUsuarioPorEmail(normalizado);
  if (!registro) {
    await gastarTiempoDeVerificacion();
    return null;
  }

  const correcta = await verificarPassword(password, registro.passwordHash);
  if (!correcta) return null;

  // El chequeo de "activo" va después de verificar la contraseña, para que una
  // cuenta desactivada no se delate respondiendo más rápido que una activa.
  if (!registro.usuario.activo) return null;
  if (registro.usuario.rol === "TECNICO" && !registro.tecnico?.activo) return null;

  if (esHashLegado(registro.passwordHash)) {
    await actualizarPasswordHash(registro.usuario.id, await hashearPassword(password));
  }

  await registrarAcceso(registro.usuario.id);
  return registro.usuario;
}

export async function crearSesion(usuarioId: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_SESION, await firmarToken(usuarioId), opcionesCookie(VIGENCIA_SESION));
}

export async function cerrarSesion(): Promise<void> {
  const store = await cookies();
  // Se sobrescribe con maxAge 0 además de borrar, para que el navegador
  // descarte también la cookie si quedó fijada con otros atributos.
  store.set(COOKIE_SESION, "", opcionesCookie(0));
  store.delete(COOKIE_SESION);
}

/**
 * Sesión del usuario actual, o null. Verifica la firma del token y vuelve a
 * leer el usuario en cada petición: si lo desactivan, la sesión muere sin
 * esperar a que expire la cookie.
 */
export async function getSesion(): Promise<Sesion | null> {
  const store = await cookies();
  const token = await verificarToken(store.get(COOKIE_SESION)?.value);
  if (!token) return null;

  try {
    const registro = await getUsuarioPorId(token.uid);
    if (!registro || !registro.usuario.activo) return null;
    return { usuario: registro.usuario, tecnico: registro.tecnico };
  } catch (err) {
    // Base de datos caída: mejor tratar la sesión como ausente (el usuario cae
    // en /login) que reventar la página con un error sin explicación.
    console.error("[dmc] no se pudo leer la sesión desde SQL Server:", err);
    return null;
  }
}
