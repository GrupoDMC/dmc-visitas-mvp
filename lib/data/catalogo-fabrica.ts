import fabrica from "@/lib/data/catalogo-fabrica.json";

// Catálogos de fábrica: las mismas tres listas de la sección 11 de
// sql/dmc_contingencia_sqlserver.sql.
//
// Esto NO son datos de demo: son las listas con las que la aplicación arranca y
// sin las cuales el técnico no puede clasificar nada (dmc.visita tiene una FK
// contra dmc.catalogo_motivo). Viven en un .json y no en un .ts para que
// `scripts/sembrar-catalogos.mjs` los lea del mismo archivo y no haya dos
// copias que se puedan separar.

export interface MotivoFabrica {
  codigo: string;
  nombre: string;
  orden: number;
}

export interface ProblemaFabrica {
  codigo: string;
  nombre: string;
  grupoLabel: string | null;
  singular: string | null;
  ayuda: string | null;
  orden: number;
  opciones: string[];
}

export interface TrabajoFabrica {
  codigo: string;
  nombre: string;
  grupoLabel: string | null;
  singular: string | null;
  orden: number;
  subtrabajos: string[];
}

export const MOTIVOS_FABRICA: MotivoFabrica[] = fabrica.motivos;
export const PROBLEMAS_FABRICA: ProblemaFabrica[] = fabrica.problemas;
export const TRABAJOS_FABRICA: TrabajoFabrica[] = fabrica.trabajos;
