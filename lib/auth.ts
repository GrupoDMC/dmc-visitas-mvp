import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { clienteAuth } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/db/perfil";
import type { Rol } from "@/lib/db/tipos";

export type Sesion = {
  userId: string;
  nombre: string;
  rol: Rol;
  tecnicoId: number | null;
};

/**
 * Sesión del usuario que hizo la petición, o null si no hay una utilizable.
 *
 * Devuelve null tanto si no hay usuario como si el perfil no existe o está
 * deshabilitado: para el resto de la app son el mismo caso, "no puede pasar".
 *
 * `cache` la memoiza por petición, así el layout, la página y las Server
 * Actions comparten una sola lectura.
 */
export const getSesion = cache(async (): Promise<Sesion | null> => {
  const supabase = await clienteAuth();

  // getUser() valida el token contra Supabase. getSession() solo lee la
  // cookie y confía en ella, que no alcanza para decidir permisos.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const perfil = await obtenerPerfil(user.id);
  if (!perfil || !perfil.activo) return null;

  return {
    userId: perfil.id,
    nombre: perfil.nombre,
    rol: perfil.rol,
    tecnicoId: perfil.tecnico_id,
  };
});

/**
 * Igual que getSesion() pero manda a /login si no hay sesión.
 * Es la que usan las páginas y acciones que requieren usuario.
 */
export async function requerirSesion(): Promise<Sesion> {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  return sesion;
}

/** Un TECNICO solo ve las visitas donde visita.tecnico_id = perfil.tecnico_id. */
export function esTecnico(sesion: Sesion): boolean {
  return sesion.rol === "TECNICO";
}

/** ADMIN y COORDINADOR ven todas las visitas. */
export function puedeVerTodas(sesion: Sesion): boolean {
  return sesion.rol === "ADMIN" || sesion.rol === "COORDINADOR";
}

/**
 * Para las pantallas de coordinación. Un TECNICO que llegue por URL directa
 * vuelve al inicio en vez de ver algo que no le corresponde.
 */
export async function requerirVerTodas(): Promise<Sesion> {
  const sesion = await requerirSesion();
  if (!puedeVerTodas(sesion)) redirect("/");
  return sesion;
}

/** Etiqueta del rol para mostrar en pantalla. */
export function nombreRol(rol: Rol): string {
  switch (rol) {
    case "ADMIN":
      return "Administración";
    case "COORDINADOR":
      return "Coordinación";
    case "TECNICO":
      return "Técnico";
  }
}
