import "server-only";
import { listarMotivos, listarProblemas, listarTrabajos } from "@/lib/data/catalogos";
import { listarClientes, listarSucursales, listarTecnicos } from "@/lib/data/maestros";
import type { RolUsuario } from "@/lib/types";
import type { Referencias } from "@/lib/ui/referencias";

/**
 * Maestros y catálogos que los diálogos y tablas del panel necesitan tener
 * completos. Se carga una vez por petición en el layout y baja por contexto.
 */
export async function cargarReferencias(rol: RolUsuario): Promise<Referencias> {
  const [clientes, sucursales, tecnicos, motivos, problemas, trabajos] = await Promise.all([
    listarClientes(),
    listarSucursales(),
    listarTecnicos(),
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
  ]);
  return { rol, clientes, sucursales, tecnicos, motivos, problemas, trabajos };
}

/** Versión reducida para el móvil: el técnico no ve el maestro de técnicos. */
export async function cargarReferenciasTecnico(): Promise<Referencias> {
  const [clientes, sucursales, motivos, problemas, trabajos] = await Promise.all([
    listarClientes(),
    listarSucursales(),
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
  ]);
  return { rol: "TECNICO", clientes, sucursales, tecnicos: [], motivos, problemas, trabajos };
}
