import type { VisitaEjecucion } from "@/lib/types";

// "Visitas en papel": los informes de años anteriores que se hicieron a mano y
// se cargan después desde el panel. No hay una columna propia para marcarlos:
// el acta queda con este texto en dmc.visita_ejecucion.dispositivo, que es
// justamente "desde dónde se registró".

export const DISPOSITIVO_PAPEL = "Informe en papel";

/** ¿El acta se cargó desde un informe en papel? Entonces no hay horas ni firma dibujada. */
export function esInformePapel(ejec: Pick<VisitaEjecucion, "dispositivo"> | null | undefined): boolean {
  return ejec?.dispositivo === DISPOSITIVO_PAPEL;
}

/** El primer año que se ofrece al cargar informes en papel. */
export const PRIMER_ANIO_PAPEL = 2015;
