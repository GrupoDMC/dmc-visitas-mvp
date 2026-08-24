"use server";

import { revalidatePath } from "next/cache";
import { getSesion } from "@/lib/auth";
import {
  guardarCliente,
  guardarSucursal,
  guardarTecnico,
  guardarUsuario,
  type DatosCliente,
  type DatosSucursal,
  type DatosTecnico,
  type DatosUsuario,
} from "@/lib/data/maestros";
import type { RolUsuario } from "@/lib/types";

// Altas y ediciones de los maestros del panel. Todo escribe en SQL Server.

export interface ResultadoMaestro {
  ok: boolean;
  error?: string;
}

/** Coordinación y administración pueden operar los maestros; el técnico no. */
async function permitido(): Promise<boolean> {
  const sesion = await getSesion();
  return !!sesion && sesion.usuario.rol !== "TECNICO";
}

/**
 * Traduce el error de SQL Server a algo que el coordinador entienda. Los
 * choques de unicidad son el caso normal (RUT o correo repetido) y no deben
 * llegar a pantalla como un volcado del driver.
 */
function mensajeDeError(err: unknown, contexto: string): string {
  const texto = err instanceof Error ? err.message : String(err);
  if (/uq_\w*rut/i.test(texto)) return "Ya existe un registro con ese RUT.";
  if (/uq_\w*email|uq_usuario_email/i.test(texto)) return "Ya existe un registro con ese correo.";
  if (/uq_sucursal_codigo/i.test(texto)) return "Ya existe una sucursal con ese código.";
  if (/uq_sucursal_cliente_nombre/i.test(texto)) return "Ese cliente ya tiene una sucursal con ese nombre.";
  if (/uq_usuario_tecnico/i.test(texto)) return "Ese técnico ya está vinculado a otro usuario.";
  if (/ck_usuario_tecnico/i.test(texto)) return "Un usuario TÉCNICO necesita un técnico vinculado, y los demás roles no pueden tenerlo.";
  if (/duplicate|unique/i.test(texto)) return "Ya existe un registro con esos datos.";
  console.error(`[dmc] ${contexto}:`, err);
  return "No se pudo guardar. Revisa los datos e inténtalo otra vez.";
}

function revalidar() {
  revalidatePath("/admin", "layout");
}

export async function guardarClienteAction(id: number | null, datos: DatosCliente): Promise<ResultadoMaestro> {
  if (!(await permitido())) return { ok: false, error: "No tienes permiso para editar clientes." };
  if (!datos.razonSocial.trim() || !datos.rut.trim()) {
    return { ok: false, error: "Razón social y RUT son obligatorios." };
  }
  try {
    await guardarCliente(id, datos);
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "guardarCliente") };
  }
  revalidar();
  return { ok: true };
}

export async function guardarSucursalAction(id: number | null, datos: DatosSucursal): Promise<ResultadoMaestro> {
  if (!(await permitido())) return { ok: false, error: "No tienes permiso para editar sucursales." };
  if (!datos.nombre.trim() || !datos.clienteId) {
    return { ok: false, error: "Nombre y cliente son obligatorios." };
  }
  try {
    await guardarSucursal(id, datos);
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "guardarSucursal") };
  }
  revalidar();
  return { ok: true };
}

export async function guardarTecnicoAction(id: number | null, datos: DatosTecnico): Promise<ResultadoMaestro> {
  if (!(await permitido())) return { ok: false, error: "No tienes permiso para editar técnicos." };
  if (!datos.nombres.trim() || !datos.rut.trim() || !datos.email.trim()) {
    return { ok: false, error: "Nombre, RUT y correo son obligatorios." };
  }
  try {
    await guardarTecnico(id, datos);
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "guardarTecnico") };
  }
  revalidar();
  return { ok: true };
}

export async function guardarUsuarioAction(
  id: number | null,
  datos: DatosUsuario & { rol: RolUsuario }
): Promise<ResultadoMaestro> {
  if (!(await permitido())) return { ok: false, error: "No tienes permiso para editar usuarios." };
  if (!datos.email.includes("@")) return { ok: false, error: "Escribe un correo válido." };
  if (datos.rol === "TECNICO" && !datos.tecnicoId) {
    return { ok: false, error: "Un usuario TÉCNICO necesita técnico vinculado." };
  }
  // Al crear, la contraseña es obligatoria: dmc.usuario.password_hash es NOT NULL
  // y un usuario sin clave no podría entrar nunca.
  if (id === null && datos.password.trim().length < 8) {
    return { ok: false, error: "La contraseña es obligatoria y debe tener al menos 8 caracteres." };
  }
  if (id !== null && datos.password.trim() && datos.password.trim().length < 8) {
    return { ok: false, error: "La contraseña nueva debe tener al menos 8 caracteres." };
  }
  try {
    await guardarUsuario(id, datos);
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "guardarUsuario") };
  }
  revalidar();
  return { ok: true };
}
