import "server-only";
import { listarEstadosProblema, listarMotivos, listarProblemas, listarTrabajos } from "@/lib/data/catalogos";
import { listarClientes, listarMalls, listarSucursales, listarTecnicos } from "@/lib/data/maestros";
import type { RolUsuario } from "@/lib/types";
import type { Referencias } from "@/lib/ui/referencias";

/**
 * Maestros y catálogos que los diálogos y tablas del panel necesitan tener
 * completos. Se carga una vez por petición en el layout y baja por contexto.
 */
export async function cargarReferencias(rol: RolUsuario, permisos: string[]): Promise<Referencias> {
  const [clientes, malls, sucursales, tecnicos, motivos, problemas, trabajos, estadosProblema] = await Promise.all([
    listarClientes(),
    listarMalls(),
    listarSucursales(),
    listarTecnicos(),
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
    listarEstadosProblema(),
  ]);
  return { rol, permisos, clientes, malls, sucursales, tecnicos, motivos, problemas, trabajos, estadosProblema };
}

/**
 * Versión reducida para el móvil. El técnico no ve el maestro de técnicos: de
 * sus compañeros baja solo el nombre, para elegir al ayudante en "Agregar
 * visita". RUT, correo y teléfono se quedan en el servidor.
 */
export async function cargarReferenciasTecnico(): Promise<Referencias> {
  const [clientes, malls, sucursales, tecnicos, motivos, problemas, trabajos, estadosProblema] = await Promise.all([
    listarClientes(),
    listarMalls(),
    listarSucursales(),
    listarTecnicos(),
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
    listarEstadosProblema(),
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
  return {
    rol: "TECNICO",
    permisos: [],
    clientes,
    malls,
    sucursales,
    tecnicos: companeros,
    motivos,
    problemas,
    trabajos,
    estadosProblema,
  };
}
