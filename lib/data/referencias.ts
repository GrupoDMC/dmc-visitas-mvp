import "server-only";
import { listarMotivos, listarProblemas, listarTrabajos } from "@/lib/data/catalogos";
import { listarClientes, listarSucursales, listarTecnicos } from "@/lib/data/maestros";
import type { RolUsuario } from "@/lib/types";
import type { Referencias } from "@/lib/ui/referencias";

/**
 * Maestros y catálogos que los diálogos y tablas del panel necesitan tener
 * completos. Se carga una vez por petición en el layout y baja por contexto.
 */
export async function cargarReferencias(rol: RolUsuario, permisos: string[]): Promise<Referencias> {
  const [clientes, sucursales, tecnicos, motivos, problemas, trabajos] = await Promise.all([
    listarClientes(),
    listarSucursales(),
    listarTecnicos(),
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
  ]);
  return { rol, permisos, clientes, sucursales, tecnicos, motivos, problemas, trabajos };
}

/**
 * Versión reducida para el móvil. El técnico no ve el maestro de técnicos: de
 * sus compañeros baja solo el nombre, para elegir al ayudante en "Agregar
 * visita". RUT, correo y teléfono se quedan en el servidor.
 */
export async function cargarReferenciasTecnico(): Promise<Referencias> {
  const [clientes, sucursales, tecnicos, motivos, problemas, trabajos] = await Promise.all([
    listarClientes(),
    listarSucursales(),
    listarTecnicos(),
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
  ]);
  const companeros = tecnicos
    .filter((t) => t.activo)
    .map((t) => ({
      id: t.id,
      nombreCompleto: t.nombreCompleto,
      nombres: t.nombres,
      apellidoPaterno: t.apellidoPaterno,
      apellidoMaterno: null,
      rut: "",
      email: "",
      telefono: null,
      activo: true,
    }));
  return { rol: "TECNICO", permisos: [], clientes, sucursales, tecnicos: companeros, motivos, problemas, trabajos };
}
