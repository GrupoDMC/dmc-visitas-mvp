import type {
  DireccionMaterial,
  EstadoProblema,
  EstadoVisita,
  TipoTrabajo,
} from "@/lib/db/tipos";

/**
 * Los catálogos de la base, replicados acá para poder armar selects y mostrar
 * etiquetas sin ir a buscarlos.
 *
 * Son tablas (`cat_estado_visita`, `cat_tipo_trabajo`) y no enums, pero su
 * contenido está fijado en `docs/01_esquema.sql` y tiene que ser idéntico al de
 * DMC_Core para que el traspaso de septiembre sea un INSERT directo. Nadie los
 * edita desde la aplicación, así que una consulta por pantalla para leer seis
 * filas que no cambian no se paga.
 *
 * Los códigos SÍ se validan contra la base: son FK, y un código inventado
 * rebota en el insert.
 */

export const ESTADOS_VISITA: readonly { codigo: EstadoVisita; nombre: string }[] = [
  { codigo: "PROGRAMADA", nombre: "Programada" },
  { codigo: "EN_CURSO", nombre: "En curso" },
  { codigo: "REALIZADA", nombre: "Realizada" },
  { codigo: "PENDIENTE", nombre: "Pendiente" },
  { codigo: "REAGENDADA", nombre: "Reagendada" },
  { codigo: "CANCELADA", nombre: "Cancelada" },
];

export const TIPOS_TRABAJO: readonly { codigo: TipoTrabajo; nombre: string }[] = [
  { codigo: "INSTALACION", nombre: "Instalación" },
  { codigo: "MANTENCION", nombre: "Mantención" },
  { codigo: "REPARACION", nombre: "Reparación" },
  { codigo: "RETIRO", nombre: "Retiro de equipos" },
  { codigo: "CAPACITACION", nombre: "Capacitación" },
  { codigo: "VISITA_TEC", nombre: "Visita técnica" },
];

export function nombreEstado(codigo: EstadoVisita): string {
  return ESTADOS_VISITA.find((e) => e.codigo === codigo)?.nombre ?? codigo;
}

/**
 * Tolerante con el null: `visita.tipo_trabajo` es nullable en el esquema, y en
 * la pantalla eso se lee como "sin especificar", no como un error.
 */
export function nombreTipoTrabajo(codigo: TipoTrabajo | null): string | null {
  if (!codigo) return null;
  return TIPOS_TRABAJO.find((t) => t.codigo === codigo)?.nombre ?? codigo;
}

export function esEstadoVisita(valor: string): valor is EstadoVisita {
  return ESTADOS_VISITA.some((e) => e.codigo === valor);
}

export function esTipoTrabajo(valor: string): valor is TipoTrabajo {
  return TIPOS_TRABAJO.some((t) => t.codigo === valor);
}

/** cat_estado_problema */
export const ESTADOS_PROBLEMA: readonly { codigo: EstadoProblema; nombre: string }[] =
  [
    { codigo: "ABIERTO", nombre: "Abierto" },
    { codigo: "EN_GESTION", nombre: "En gestión" },
    { codigo: "RESUELTO", nombre: "Resuelto" },
  ];

export function nombreEstadoProblema(codigo: EstadoProblema): string {
  return ESTADOS_PROBLEMA.find((e) => e.codigo === codigo)?.nombre ?? codigo;
}

export function esEstadoProblema(valor: string): valor is EstadoProblema {
  return ESTADOS_PROBLEMA.some((e) => e.codigo === valor);
}

/** cat_direccion_material */
export const DIRECCIONES_MATERIAL: readonly {
  codigo: DireccionMaterial;
  nombre: string;
}[] = [
  { codigo: "INSTALADO", nombre: "Instalado" },
  { codigo: "RETIRADO", nombre: "Retirado" },
];

export function nombreDireccionMaterial(codigo: DireccionMaterial): string {
  return DIRECCIONES_MATERIAL.find((d) => d.codigo === codigo)?.nombre ?? codigo;
}

export function esDireccionMaterial(valor: string): valor is DireccionMaterial {
  return DIRECCIONES_MATERIAL.some((d) => d.codigo === valor);
}
