"use server";

import { revalidatePath } from "next/cache";
import { sesionCon } from "@/lib/auth";
import {
  faltaMigracionNotas,
  faltaMigracionMalls,
  guardarCliente,
  guardarMall,
  guardarSucursal,
  guardarTecnico,
  guardarUsuario,
  ponerTiendasDeMall,
  RutRepetido,
  type DatosCliente,
  type DatosMall,
  type DatosSucursal,
  type DatosTecnico,
  type DatosUsuario,
  listarUsuarios,
} from "@/lib/data/maestros";
import { eliminarRol, guardarRol, listarRoles, type DatosRol } from "@/lib/data/roles";
import { normalizarPermisos, tiene } from "@/lib/permisos";
import { mensajeRut, rutCompleto } from "@/lib/ui/formato";
import type { RolUsuario } from "@/lib/types";

// Altas y ediciones de los maestros del panel. Todo escribe en SQL Server.

export interface ResultadoMaestro {
  ok: boolean;
  error?: string;
}

/** Agregar y editar son permisos distintos: `id` null es un alta. */
function sesionMaestro(modulo: string, id: number | null) {
  return sesionCon(`${modulo}.${id === null ? "crear" : "editar"}`);
}

/**
 * Traduce el error de SQL Server a algo que el coordinador entienda. Los
 * choques de unicidad son el caso normal (RUT o correo repetido) y no deben
 * llegar a pantalla como un volcado del driver.
 */
function mensajeDeError(err: unknown, contexto: string): string {
  if (err instanceof RutRepetido) {
    return err.donde === "cliente"
      ? `El RUT ${err.rut} ya está registrado en otra empresa. El RUT es único: busca esa empresa y edítala.`
      : `El RUT ${err.rut} ya está registrado en otra persona. El RUT es único: busca a esa persona y edítala.`;
  }
  if (faltaMigracionNotas(err)) {
    return "Falta aplicar la migración 009 en la base de datos. Avísale al administrador.";
  }
  if (faltaMigracionMalls(err)) {
    return "Falta aplicar la migración 011 en la base de datos. Avísale al administrador.";
  }
  const texto = err instanceof Error ? err.message : String(err);
  if (/uq_mall_nombre/i.test(texto)) return "Ya existe un mall con ese nombre.";
  if (/fk_sucursal_mall/i.test(texto)) return "Ese mall ya no existe. Recarga la página.";
  if (/uq_\w*rut/i.test(texto)) return "Ya existe un registro con ese RUT.";
  if (/uq_\w*email|uq_usuario_email/i.test(texto)) return "Ya existe un registro con ese correo.";
  if (/uq_sucursal_codigo/i.test(texto)) return "Ya existe una sucursal con ese código.";
  if (/uq_sucursal_cliente_nombre/i.test(texto)) return "Ese cliente ya tiene una sucursal con ese nombre.";
  if (/uq_usuario_tecnico/i.test(texto)) return "Ese técnico ya está vinculado a otro usuario.";
  if (/ck_usuario_tecnico/i.test(texto)) return "Un usuario TÉCNICO necesita un técnico vinculado, y los demás roles no pueden tenerlo.";
  if (/uq_rol_nombre/i.test(texto)) return "Ya existe un rol con ese nombre.";
  if (/fk_usuario_rol/i.test(texto)) return "Ese rol ya no existe. Recarga la página y elige otro.";
  if (/duplicate|unique/i.test(texto)) return "Ya existe un registro con esos datos.";
  console.error(`[dmc] ${contexto}:`, err);
  return "No se pudo guardar. Revisa los datos e inténtalo otra vez.";
}

function revalidar() {
  revalidatePath("/admin", "layout");
}

export async function guardarClienteAction(id: number | null, datos: DatosCliente): Promise<ResultadoMaestro> {
  if (!(await sesionMaestro("clientes", id))) return { ok: false, error: "No tienes permiso para editar clientes." };
  if (!datos.razonSocial.trim() || !datos.rut.trim()) {
    return { ok: false, error: "Razón social y RUT son obligatorios." };
  }
  if (!rutCompleto(datos.rut)) return { ok: false, error: mensajeRut(datos.rut) ?? "El RUT está incompleto." };
  // Un cliente no queda inactivo sin que conste por qué.
  if (!datos.activo && !datos.motivoInactivo?.trim()) {
    return { ok: false, error: "Explica por qué se desactiva el cliente." };
  }
  try {
    await guardarCliente(id, datos);
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "guardarCliente") };
  }
  revalidar();
  return { ok: true };
}

export async function guardarMallAction(id: number | null, datos: DatosMall): Promise<ResultadoMaestro> {
  if (!(await sesionMaestro("malls", id))) return { ok: false, error: "No tienes permiso para editar malls." };
  if (!datos.nombre.trim() || !datos.direccion.trim()) {
    return { ok: false, error: "Nombre y dirección son obligatorios." };
  }
  try {
    await guardarMall(id, datos);
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "guardarMall") };
  }
  revalidar();
  return { ok: true };
}

/** Las tiendas del mall: la lista completa, tal como quedó en el diálogo. */
export async function guardarTiendasMallAction(mallId: number, sucursalIds: number[]): Promise<ResultadoMaestro> {
  if (!(await sesionCon("malls.editar"))) return { ok: false, error: "No tienes permiso para editar malls." };
  const ids = [...new Set(sucursalIds)].filter((x) => Number.isInteger(x) && x > 0);
  if (!mallId || ids.length !== sucursalIds.length) return { ok: false, error: "La lista de tiendas no es válida." };
  try {
    await ponerTiendasDeMall(mallId, ids);
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "ponerTiendasDeMall") };
  }
  revalidar();
  return { ok: true };
}

export async function guardarSucursalAction(id: number | null, datos: DatosSucursal): Promise<ResultadoMaestro> {
  if (!(await sesionMaestro("sucursales", id))) return { ok: false, error: "No tienes permiso para editar sucursales." };
  if (!datos.nombre.trim() || !datos.clienteId) {
    return { ok: false, error: "Nombre y cliente son obligatorios." };
  }
  // Una sucursal no queda inactiva sin que conste por qué.
  if (!datos.activo && !datos.motivoInactivo?.trim()) {
    return { ok: false, error: "Explica por qué se desactiva la sucursal." };
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
  if (!(await sesionMaestro("tecnicos", id))) return { ok: false, error: "No tienes permiso para editar técnicos." };
  if (!datos.nombres.trim() || !datos.rut.trim() || !datos.email.trim()) {
    return { ok: false, error: "Nombre, RUT y correo son obligatorios." };
  }
  if (!rutCompleto(datos.rut)) return { ok: false, error: mensajeRut(datos.rut) ?? "El RUT está incompleto." };
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
  const sesion = await sesionMaestro("usuarios", id);
  if (!sesion) return { ok: false, error: "No tienes permiso para editar usuarios." };
  if (!datos.email.includes("@")) return { ok: false, error: "Escribe un correo válido." };

  // Quien no es administrador no puede fabricarse más acceso del que tiene:
  // ni tocar cuentas de administrador, ni cambiarse el rol, ni dar un rol que
  // pueda más que él.
  if (sesion.usuario.rol !== "ADMIN") {
    const actual = id === null ? null : (await listarUsuarios()).find((u) => u.id === id) ?? null;
    if (datos.rol === "ADMIN" || actual?.rol === "ADMIN") {
      return { ok: false, error: "Solo un administrador puede crear o editar cuentas de administrador." };
    }
    const cambiaRol = !actual || actual.rol !== datos.rol || (actual.rolId ?? null) !== (datos.rolId ?? null);
    if (id === sesion.usuario.id && cambiaRol) {
      return { ok: false, error: "No puedes cambiar tu propio rol." };
    }
    if (cambiaRol && datos.rol === "COORDINADOR") {
      const rol = (await listarRoles())?.find((r) => r.id === datos.rolId);
      if (rol && !rol.permisos.every((p) => tiene(sesion.permisos, p))) {
        return { ok: false, error: `El rol «${rol.nombre}» tiene permisos que tú no tienes: no lo puedes asignar.` };
      }
    }
  }
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

// ── Roles y permisos ────────────────────────────────────────────────────────

/** Crea un rol o cambia su nombre y lo que puede hacer. */
export async function guardarRolAction(id: number | null, datos: DatosRol): Promise<ResultadoMaestro> {
  const sesion = await sesionCon("usuarios.roles");
  if (!sesion) return { ok: false, error: "No tienes permiso para administrar roles." };
  const nombre = datos.nombre.trim();
  if (!nombre) return { ok: false, error: "El rol necesita un nombre." };
  if (/^(administrador|t[eé]cnico)$/i.test(nombre)) {
    return { ok: false, error: "Ese nombre es de un rol fijo del sistema. Elige otro." };
  }
  const permisos = normalizarPermisos(datos.permisos);
  if (permisos.length === 0) return { ok: false, error: "Marca al menos un permiso: un rol vacío no puede ver nada." };

  try {
    // Quien no es administrador solo da o quita los permisos que él tiene.
    if (sesion.usuario.rol !== "ADMIN") {
      const previos = id === null ? [] : (await listarRoles())?.find((r) => r.id === id)?.permisos ?? [];
      const tocados = [...permisos.filter((p) => !previos.includes(p)), ...previos.filter((p) => !permisos.includes(p))];
      if (tocados.some((p) => !tiene(sesion.permisos, p))) {
        return { ok: false, error: "Solo puedes dar o quitar permisos que tú también tienes." };
      }
    }
    await guardarRol(id, { nombre, descripcion: datos.descripcion, permisos });
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "guardarRol") };
  }
  revalidar();
  return { ok: true };
}

export async function eliminarRolAction(id: number): Promise<ResultadoMaestro> {
  if (!(await sesionCon("usuarios.roles"))) return { ok: false, error: "No tienes permiso para administrar roles." };
  try {
    const fallo = await eliminarRol(id);
    if (fallo) return { ok: false, error: fallo };
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "eliminarRol") };
  }
  revalidar();
  return { ok: true };
}
