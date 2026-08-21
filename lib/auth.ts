import "server-only";
import { cookies } from "next/headers";
import { credencialesDemo, getUsuarioByEmail, getTecnicoById } from "@/lib/mock/maestros";
import type { Usuario, Tecnico } from "@/lib/types";

const COOKIE = "dmc_session";

export interface Sesion {
  usuario: Usuario;
  tecnico: Tecnico | null;
}

// Autenticación mock: valida contra lib/mock/maestros mientras no hay
// conexión real a SQL Server. Cuando el schema quede confirmado, esto pasa
// a validar password_hash contra dmc.usuario vía lib/db/pool.
export function autenticar(email: string, password: string): Usuario | null {
  const usuario = getUsuarioByEmail(email);
  if (!usuario || !usuario.activo) return null;
  if (credencialesDemo[usuario.email] !== password) return null;
  return usuario;
}

export async function crearSesion(usuarioId: number) {
  const store = await cookies();
  store.set(COOKIE, String(usuarioId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function cerrarSesion() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSesion(): Promise<Sesion | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  const id = Number(raw);
  const { usuarios } = await import("@/lib/mock/maestros");
  const usuario = usuarios.find((u) => u.id === id);
  if (!usuario || !usuario.activo) return null;
  return {
    usuario,
    tecnico: usuario.tecnicoId ? getTecnicoById(usuario.tecnicoId) ?? null : null,
  };
}
