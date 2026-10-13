"use server";

import { revalidatePath } from "next/cache";
import { crearSesion, sesionCon } from "@/lib/auth";
import {
  guardarCliente,
  guardarMall,
  guardarSucursal,
  crearSucursalesLote,
  guardarTecnico,
  guardarUsuario,
  ponerTiendasDeMall,
  CuentaNoPermitida,
  RutRepetido,
  TiendaEnOtroMall,
  type DatosCliente,
  type DatosMall,
  type DatosSucursal,
  type DatosSucursalLote,
  type DatosTecnico,
  type DatosUsuario,
} from "@/lib/data/maestros";
import { auditar, diferencia } from "@/lib/data/auditoria";
import { log } from "@/lib/log";
import { eliminarRol, guardarPermisosCelular, guardarRol, leerRol, type Cuenta, type DatosRol } from "@/lib/data/roles";
import { motivoCuentaAjena, normalizarPermisos, puedeAdministrarCuenta, tiene } from "@/lib/permisos";
import { validarPasswordNueva } from "@/lib/password";
import { mensajeRut, rutCompleto } from "@/lib/ui/formato";
import { idPositivo, validar } from "@/lib/validacion/comun";
import {
  entradaCliente,
  entradaMall,
  entradaPermisosCelular,
  entradaRol,
  entradaSucursal,
  entradaSucursalesLote,
  entradaTecnico,
  entradaTiendasMall,
  entradaUsuario,
} from "@/lib/validacion/maestros";
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
  if (err instanceof CuentaNoPermitida) return err.message;
  if (err instanceof RutRepetido) {
    return err.donde === "cliente"
      ? `El RUT ${err.rut} ya está registrado en otra empresa. El RUT es único: busca esa empresa y edítala.`
      : `El RUT ${err.rut} ya está registrado en otra persona. El RUT es único: busca a esa persona y edítala.`;
  }
  if (err instanceof TiendaEnOtroMall) {
    return `Ya está en otro mall: ${err.tiendas.join(", ")}. Una sucursal está en un solo mall: quítala de ese primero.`;
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
  log.error(contexto, { err });
  return "No se pudo guardar. Revisa los datos e inténtalo otra vez.";
}

function revalidar() {
  revalidatePath("/admin", "layout");
}

export async function guardarClienteAction(idPedido: number | null, datosPedidos: DatosCliente): Promise<ResultadoMaestro> {
  if (!(await sesionMaestro("clientes", idPedido))) return { ok: false, error: "No tienes permiso para editar clientes." };
  const entrada = validar(entradaCliente, { id: idPedido, datos: datosPedidos }, "guardarCliente");
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const { id, datos } = entrada.datos;
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

export async function guardarMallAction(idPedido: number | null, datosPedidos: DatosMall): Promise<ResultadoMaestro> {
  if (!(await sesionMaestro("malls", idPedido))) return { ok: false, error: "No tienes permiso para editar malls." };
  const entrada = validar(entradaMall, { id: idPedido, datos: datosPedidos }, "guardarMall");
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const { id, datos } = entrada.datos;
  if (!datos.nombre.trim() || !datos.direccion.trim() || !datos.comuna?.trim() || !datos.region?.trim()) {
    return { ok: false, error: "Nombre, dirección, comuna y región son obligatorios." };
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
export async function guardarTiendasMallAction(mallIdPedido: number, sucursalIdsPedidos: number[]): Promise<ResultadoMaestro> {
  if (!(await sesionCon("malls.editar"))) return { ok: false, error: "No tienes permiso para editar malls." };
  const entrada = validar(
    entradaTiendasMall,
    { mallId: mallIdPedido, sucursalIds: sucursalIdsPedidos },
    "guardarTiendasMall"
  );
  if (!entrada.ok) return { ok: false, error: "La lista de tiendas no es válida." };
  const { mallId, sucursalIds } = entrada.datos;
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

export async function guardarSucursalAction(idPedido: number | null, datosPedidos: DatosSucursal): Promise<ResultadoMaestro> {
  if (!(await sesionMaestro("sucursales", idPedido))) return { ok: false, error: "No tienes permiso para editar sucursales." };
  const entrada = validar(entradaSucursal, { id: idPedido, datos: datosPedidos }, "guardarSucursal");
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const { id, datos } = entrada.datos;
  if (!datos.nombre.trim() || !datos.clienteId) {
    return { ok: false, error: "Nombre y cliente son obligatorios." };
  }
  // Una sucursal no queda inactiva sin que conste por qué.
  if (!datos.activo && !datos.motivoInactivo?.trim()) {
    return { ok: false, error: "Explica por qué se desactiva la sucursal." };
  }
  if (datos.fechaInstalacion && !/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaInstalacion)) {
    return { ok: false, error: "La fecha de instalación no es válida." };
  }
  try {
    await guardarSucursal(id, datos);
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "guardarSucursal") };
  }
  revalidar();
  return { ok: true };
}

/** Alta masiva: todas las sucursales nuevas de un cliente, en un solo INSERT. */
export async function crearSucursalesLoteAction(
  clientePedido: number,
  filasPedidas: DatosSucursalLote[]
): Promise<ResultadoMaestro & { creadas?: number }> {
  if (!(await sesionCon("sucursales.crear"))) return { ok: false, error: "No tienes permiso para crear sucursales." };
  const entrada = validar(entradaSucursalesLote, { clienteId: clientePedido, filas: filasPedidas }, "crearSucursalesLote");
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const { clienteId, filas } = entrada.datos;
  if (!clienteId || filas.length === 0) return { ok: false, error: "No hay sucursales por crear." };
  if (filas.some((f) => !f.nombre.trim() || !f.direccion.trim() || !f.comuna.trim() || !f.region.trim())) {
    return { ok: false, error: "Cada sucursal necesita nombre, dirección, comuna y región." };
  }
  try {
    const creadas = await crearSucursalesLote(clienteId, filas);
    revalidar();
    return { ok: true, creadas };
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "crearSucursalesLote") };
  }
}

export async function guardarTecnicoAction(idPedido: number | null, datosPedidos: DatosTecnico): Promise<ResultadoMaestro> {
  if (!(await sesionMaestro("tecnicos", idPedido))) return { ok: false, error: "No tienes permiso para editar técnicos." };
  const entrada = validar(entradaTecnico, { id: idPedido, datos: datosPedidos }, "guardarTecnico");
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const { id, datos } = entrada.datos;
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
  idPedido: number | null,
  datosPedidos: DatosUsuario & { rol: RolUsuario }
): Promise<ResultadoMaestro> {
  const sesion = await sesionMaestro("usuarios", idPedido);
  if (!sesion) return { ok: false, error: "No tienes permiso para editar usuarios." };
  const entrada = validar(entradaUsuario, { id: idPedido, datos: datosPedidos }, "guardarUsuario");
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const { id, datos } = entrada.datos;
  if (!datos.email.includes("@")) return { ok: false, error: "Escribe un correo válido." };
  if (datos.rol === "TECNICO" && !datos.tecnicoId) {
    return { ok: false, error: "Un usuario TÉCNICO necesita técnico vinculado." };
  }
  // Al crear, la contraseña es obligatoria: dmc.usuario.password_hash es NOT
  // NULL y un usuario sin clave no podría entrar nunca. Al editar, vacía = no
  // se cambia. No se recorta: se guarda tal como se escribió.
  if (id === null || datos.password !== "") {
    const fallo = validarPasswordNueva(datos.password, datos.email);
    if (fallo) return { ok: false, error: fallo };
  }

  let previa: Cuenta | null = null;
  try {
    const guardado = await guardarUsuario(id, datos, {
      actorId: sesion.usuario.id,
      // Quien no es administrador no puede fabricarse más acceso del que
      // tiene: ni tocar cuentas que pueden más que él, ni cambiarse el rol, ni
      // dar un rol que pueda más que él.
      autorizar: (actual, nueva) => {
        previa = actual;
        if (actual && !puedeAdministrarCuenta(sesion, actual)) return motivoCuentaAjena(actual);
        if (!puedeAdministrarCuenta(sesion, nueva)) {
          return nueva.rol === "ADMIN"
            ? "Solo un administrador puede crear o editar cuentas de administrador."
            : "El rol elegido tiene permisos que tú no tienes: no lo puedes asignar.";
        }
        const cambiaRol = !actual || actual.rol !== nueva.rol || actual.rolId !== nueva.rolId;
        if (sesion.usuario.rol !== "ADMIN" && id === sesion.usuario.id && cambiaRol) {
          return "No puedes cambiar tu propio rol.";
        }
        return null;
      },
    });
    // Si se cambió la clave propia, la versión de sesión subió: esta sesión
    // sigue con un token nuevo y las demás quedan cerradas.
    if (guardado.id === sesion.usuario.id) await crearSesion(guardado.id, guardado.sesionVersion);
    await auditarUsuario(sesion, guardado.id, previa as Cuenta | null, datos);
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "guardarUsuario") };
  }
  revalidar();
  return { ok: true };
}

/** Anota lo sensible de haber guardado una cuenta: alta, baja, rol y clave. */
async function auditarUsuario(
  sesion: { usuario: { id: number; email: string } },
  id: number,
  previa: Cuenta | null,
  datos: DatosUsuario & { rol: RolUsuario }
) {
  const base = { entidad: "usuario", entidadId: id } as const;
  if (!previa) {
    await auditar(sesion, { ...base, accion: "usuario.alta", detalle: { rol: datos.rol, rolId: datos.rolId ?? null } });
    return;
  }
  if (previa.activo && !datos.activo) await auditar(sesion, { ...base, accion: "usuario.desactivar" });
  if (!previa.activo && datos.activo) await auditar(sesion, { ...base, accion: "usuario.reactivar" });
  const rolId = datos.rol === "COORDINADOR" ? datos.rolId ?? null : null;
  if (previa.rol !== datos.rol || previa.rolId !== rolId) {
    await auditar(sesion, {
      ...base,
      accion: "usuario.rol",
      detalle: { de: { rol: previa.rol, rolId: previa.rolId }, a: { rol: datos.rol, rolId } },
    });
  }
  if (datos.password !== "") {
    await auditar(sesion, { ...base, accion: id === sesion.usuario.id ? "password.cambio" : "password.reseteo" });
  }
}

// ── Roles y permisos ────────────────────────────────────────────────────────

/** Crea un rol o cambia su nombre y lo que puede hacer. */
export async function guardarRolAction(idPedido: number | null, datosPedidos: DatosRol): Promise<ResultadoMaestro> {
  const sesion = await sesionCon("usuarios.roles");
  if (!sesion) return { ok: false, error: "No tienes permiso para administrar roles." };
  const entrada = validar(entradaRol, { id: idPedido, datos: datosPedidos }, "guardarRol");
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const { id, datos } = entrada.datos;
  const nombre = datos.nombre.trim();
  if (!nombre) return { ok: false, error: "El rol necesita un nombre." };
  if (/^(administrador|t[eé]cnico)$/i.test(nombre)) {
    return { ok: false, error: "Ese nombre es de un rol fijo del sistema. Elige otro." };
  }
  const permisos = normalizarPermisos(datos.permisos);
  if (permisos.length === 0) return { ok: false, error: "Marca al menos un permiso: un rol vacío no puede ver nada." };

  try {
    // Quien no es administrador no toca roles que pueden más que él, y solo da
    // o quita los permisos que él tiene.
    if (sesion.usuario.rol !== "ADMIN") {
      const previo = id === null ? null : await leerRol(id);
      if (id !== null && !previo) return { ok: false, error: "Ese rol ya no existe. Recarga la página." };
      const previos = previo?.permisos ?? [];
      if (!puedeAdministrarCuenta(sesion, { permisos: previos })) {
        return { ok: false, error: `El rol «${previo?.nombre}» tiene permisos que tú no tienes: no lo puedes editar.` };
      }
      const tocados = [...permisos.filter((p) => !previos.includes(p)), ...previos.filter((p) => !permisos.includes(p))];
      if (tocados.some((p) => !tiene(sesion.permisos, p))) {
        return { ok: false, error: "Solo puedes dar o quitar permisos que tú también tienes." };
      }
    }
    const antes = id === null ? null : await leerRol(id);
    const guardadoId = await guardarRol(id, { nombre, descripcion: datos.descripcion, permisos });
    await auditar(sesion, {
      accion: id === null ? "rol.alta" : "rol.editar",
      entidad: "rol",
      entidadId: id ?? guardadoId,
      detalle: { nombre, ...diferencia(antes?.permisos ?? [], permisos) },
    });
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "guardarRol") };
  }
  revalidar();
  return { ok: true };
}

export async function eliminarRolAction(idPedido: number): Promise<ResultadoMaestro> {
  const sesion = await sesionCon("usuarios.roles");
  if (!sesion) return { ok: false, error: "No tienes permiso para administrar roles." };
  const entrada = validar(idPositivo, idPedido, "eliminarRol");
  if (!entrada.ok) return { ok: false, error: "Ese rol no existe." };
  const id = entrada.datos;
  try {
    // Borrar un rol que puede más que uno es quitarles acceso a otros por
    // encima de lo que uno mismo tiene.
    const rol = await leerRol(id);
    if (rol && !puedeAdministrarCuenta(sesion, rol)) {
      return { ok: false, error: `El rol «${rol.nombre}» tiene permisos que tú no tienes: no lo puedes eliminar.` };
    }
    const fallo = await eliminarRol(id);
    if (fallo) return { ok: false, error: fallo };
    await auditar(sesion, { accion: "rol.eliminar", entidad: "rol", entidadId: id, detalle: { nombre: rol?.nombre } });
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "eliminarRol") };
  }
  revalidar();
  return { ok: true };
}

/** Los permisos de celular de todos los técnicos (apartado «Permisos del celular»). */
export async function guardarPermisosCelularAction(permisosPedidos: string[]): Promise<ResultadoMaestro> {
  const sesion = await sesionCon("usuarios.roles");
  if (!sesion) return { ok: false, error: "No tienes permiso para administrar roles." };
  const entrada = validar(entradaPermisosCelular, permisosPedidos, "guardarPermisosCelular");
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const permisos = entrada.datos;
  try {
    await guardarPermisosCelular(permisos);
    await auditar(sesion, { accion: "permisos_celular.editar", entidad: "permisos_celular", detalle: { permisos } });
  } catch (err) {
    return { ok: false, error: mensajeDeError(err, "guardarPermisosCelular") };
  }
  revalidar();
  return { ok: true };
}
