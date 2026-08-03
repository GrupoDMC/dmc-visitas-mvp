import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PerfilRow, Rol } from "./tipos";

export type UsuarioListado = {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  tecnico: { nombres: string; apellidos: string } | null;
};

const CAMPOS_PERFIL =
  "id, nombre, rol, tecnico_id, activo, creado_en, tecnico ( nombres, apellidos )";

type PerfilConTecnico = PerfilRow & {
  tecnico: { nombres: string; apellidos: string } | null;
};

/**
 * El correo vive en `auth.users`, no en `perfil`. Se resuelve con un solo
 * listado de la Admin API y se cruza en memoria por id — para la cantidad de
 * cuentas de esta app (personal de DMC, no miles) no hace falta paginar.
 */
async function mapaDeCorreos(): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin().auth.admin.listUsers({
    perPage: 1000,
  });

  if (error) {
    throw new Error(`No se pudieron leer los correos de Auth: ${error.message}`);
  }

  const mapa = new Map<string, string>();
  for (const usuario of data.users) {
    if (usuario.email) mapa.set(usuario.id, usuario.email);
  }
  return mapa;
}

/** Listado completo de perfiles, activos e inactivos. Ordenado por nombre. */
export async function listarUsuarios(): Promise<UsuarioListado[]> {
  const [{ data, error }, correos] = await Promise.all([
    supabaseAdmin()
      .from("perfil")
      .select(CAMPOS_PERFIL)
      .order("nombre", { ascending: true })
      .returns<PerfilConTecnico[]>(),
    mapaDeCorreos(),
  ]);

  if (error) {
    throw new Error(`No se pudo leer el listado de usuarios: ${error.message}`);
  }

  return (data ?? []).map((perfil) => ({
    id: perfil.id,
    nombre: perfil.nombre,
    correo: correos.get(perfil.id) ?? "—",
    rol: perfil.rol,
    activo: perfil.activo,
    tecnico: perfil.tecnico,
  }));
}

/** Un usuario puntual, para la ficha de `/usuarios/[id]`. */
export async function obtenerUsuario(id: string): Promise<UsuarioListado | null> {
  const admin = supabaseAdmin();

  const [{ data: perfil, error: errorPerfil }, { data: auth }] = await Promise.all([
    admin
      .from("perfil")
      .select(CAMPOS_PERFIL)
      .eq("id", id)
      .maybeSingle<PerfilConTecnico>(),
    admin.auth.admin.getUserById(id),
  ]);

  if (errorPerfil) {
    throw new Error(`No se pudo leer el usuario: ${errorPerfil.message}`);
  }
  if (!perfil) return null;

  return {
    id: perfil.id,
    nombre: perfil.nombre,
    correo: auth.user?.email ?? "—",
    rol: perfil.rol,
    activo: perfil.activo,
    tecnico: perfil.tecnico,
  };
}

export class CorreoRepetido extends Error {}

export type DatosUsuarioNuevo = {
  nombre: string;
  correo: string;
  rol: Rol;
  tecnico_id: number | null;
};

/**
 * Crea el usuario en Supabase Auth y, en el mismo paso, su fila en `perfil`.
 *
 * Las dos escrituras NO son una transacción — son dos sistemas distintos. Si
 * el insert de `perfil` falla después de crear el usuario en Auth, hay que
 * deshacer ese alta: si no, queda una cuenta que puede entrar pero no tiene
 * con qué (sin perfil, `getSesion()` la trata como inhabilitada, pero mejor
 * no dejar cuentas huérfanas dando vueltas).
 */
export async function crearUsuarioConAuth(
  datos: DatosUsuarioNuevo,
  claveTemporal: string,
): Promise<{ id: string }> {
  const admin = supabaseAdmin();

  const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
    email: datos.correo,
    password: claveTemporal,
    email_confirm: true,
  });

  if (errorAuth) {
    if (/regist|exist/i.test(errorAuth.message)) {
      throw new CorreoRepetido(errorAuth.message);
    }
    throw new Error(`No se pudo crear el usuario en Auth: ${errorAuth.message}`);
  }

  const usuarioId = creado.user.id;

  const { error: errorPerfil } = await admin.from("perfil").insert({
    id: usuarioId,
    nombre: datos.nombre,
    rol: datos.rol,
    tecnico_id: datos.tecnico_id,
    activo: true,
  });

  if (errorPerfil) {
    await admin.auth.admin.deleteUser(usuarioId);
    throw new Error(`No se pudo guardar el perfil: ${errorPerfil.message}`);
  }

  return { id: usuarioId };
}

/**
 * Restablecer la contraseña, nunca por correo. La cuenta de Auth se
 * mantiene: nunca se llama a `deleteUser`.
 */
export async function restablecerClaveDeUsuario(
  id: string,
  claveTemporal: string,
): Promise<void> {
  const { error } = await supabaseAdmin().auth.admin.updateUserById(id, {
    password: claveTemporal,
  });

  if (error) {
    throw new Error(`No se pudo restablecer la contraseña: ${error.message}`);
  }
}

/** "Desactivar" es siempre esto: perfil.activo = false. Nunca se borra el usuario de Auth. */
export async function cambiarActivoPerfil(
  id: string,
  activo: boolean,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("perfil")
    .update({ activo })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo cambiar el estado del usuario: ${error.message}`);
  }
}
