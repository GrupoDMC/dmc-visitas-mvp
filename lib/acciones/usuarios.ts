"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirAdmin } from "@/lib/auth";
import { conAviso } from "@/lib/avisos";
import { generarClaveTemporal } from "@/lib/claves";
import { esquemaUsuario } from "@/lib/validacion/usuarios";
import { obtenerPerfil } from "@/lib/db/perfil";
import {
  cambiarActivoPerfil,
  CorreoRepetido,
  crearUsuarioConAuth,
  restablecerClaveDeUsuario,
} from "@/lib/db/usuarios";
import {
  erroresDeZod,
  falla,
  marcada,
  texto,
  SIN_CLAVE,
  SIN_USUARIO,
  type EstadoClave,
  type EstadoFormulario,
  type EstadoUsuario,
} from "./formulario";

async function permitido() {
  return requerirAdmin();
}

function leerFormulario(datos: FormData) {
  return {
    nombre: texto(datos, "nombre"),
    correo: texto(datos, "correo"),
    rol: texto(datos, "rol"),
    tecnico_id: texto(datos, "tecnico_id"),
  };
}

/**
 * No redirige: la contraseña temporal se muestra una sola vez en esta misma
 * pantalla, para dictarla por teléfono. Redirigir la perdería (no hay dónde
 * llevarla que no sea la URL, y ahí no puede viajar). Ver `EstadoUsuario`.
 */
export async function crearUsuarioAccion(
  _previo: EstadoUsuario,
  datos: FormData,
): Promise<EstadoUsuario> {
  await permitido();

  const resultado = esquemaUsuario.safeParse(leerFormulario(datos));
  if (!resultado.success) {
    return { ...erroresDeZod(resultado.error), creado: null };
  }

  const valores = resultado.data;
  const claveTemporal = generarClaveTemporal();

  try {
    await crearUsuarioConAuth(valores, claveTemporal);
  } catch (error) {
    if (error instanceof CorreoRepetido) {
      return {
        error: null,
        errores: { correo: `Ya existe un usuario con el correo ${valores.correo}.` },
        creado: null,
      };
    }
    throw error;
  }

  revalidatePath("/usuarios");

  return { ...SIN_USUARIO, creado: { correo: valores.correo, claveTemporal } };
}

/**
 * Tampoco redirige, por el mismo motivo: la contraseña nueva se muestra una
 * sola vez en el propio diálogo desde el que se pidió.
 */
export async function restablecerClaveAccion(
  _previo: EstadoClave,
  datos: FormData,
): Promise<EstadoClave> {
  await permitido();

  const id = texto(datos, "id");
  if (!id) return { ...SIN_CLAVE, error: "No se pudo identificar el usuario." };

  const perfil = await obtenerPerfil(id);
  if (!perfil) return { ...SIN_CLAVE, error: "Ese usuario ya no existe." };

  const claveTemporal = generarClaveTemporal();
  await restablecerClaveDeUsuario(id, claveTemporal);

  return { ...SIN_CLAVE, claveTemporal };
}

export async function cambiarActivoUsuarioAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const sesion = await permitido();

  const id = texto(datos, "id");
  if (!id) return falla("No se pudo identificar el usuario.");

  const activar = marcada(datos, "activar");

  if (!activar && id === sesion.userId) {
    return falla("No podés desactivar tu propia cuenta.");
  }

  const perfil = await obtenerPerfil(id);
  if (!perfil) return falla("Ese usuario ya no existe.");

  await cambiarActivoPerfil(id, activar);

  revalidatePath("/usuarios");
  redirect(
    conAviso("/usuarios", activar ? "usuario-activado" : "usuario-desactivado"),
  );
}
