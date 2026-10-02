import type { CatalogoEstadoProblema, EstadoVisita, EstadoProblema } from "@/lib/types";

export const ESTADO_VISITA_LABEL: Record<EstadoVisita, string> = {
  PROGRAMADA: "Programada",
  EN_CURSO: "En curso",
  COMPLETADA: "Completada",
  PENDIENTE: "Pendiente",
  REAGENDADA: "Reagendada",
  CANCELADA: "Cancelada",
  CANCELADA_ADMIN: "Cancelada por admin",
};

/** Los dos estados que dejan la visita cerrada sin acta. */
export const ESTADOS_CANCELADOS: EstadoVisita[] = ["CANCELADA", "CANCELADA_ADMIN"];

export function estaCancelada(estado: EstadoVisita): boolean {
  return estado === "CANCELADA" || estado === "CANCELADA_ADMIN";
}

type VisitaConEquipo = {
  estado: EstadoVisita;
  tecnicoId: number;
  tecnicoAyudanteId: number | null;
  tomadaPorTecnicoId: number | null;
  tecnico?: { nombreCompleto: string };
  tecnicoAyudante?: { nombreCompleto: string };
};

/** ¿Va a esta visita, como asignado o como ayudante? */
export function participaEnVisita(visita: VisitaConEquipo, tecnicoId: number): boolean {
  return visita.tecnicoId === tecnicoId || visita.tecnicoAyudanteId === tecnicoId;
}

/** EN_CURSO y tomada por el otro técnico: este solo puede mirarla. */
export function tomadaPorOtro(visita: VisitaConEquipo, tecnicoId: number): boolean {
  return visita.estado === "EN_CURSO" && visita.tomadaPorTecnicoId !== tecnicoId;
}

/** El nombre de quien tiene tomada la visita en curso, o null si nadie. */
export function nombreDeQuienLaTomo(visita: VisitaConEquipo): string | null {
  if (visita.tomadaPorTecnicoId === null) return null;
  const quien = visita.tomadaPorTecnicoId === visita.tecnicoAyudanteId ? visita.tecnicoAyudante : visita.tecnico;
  return quien?.nombreCompleto ?? null;
}

export type TagVariant ="accent" | "neutral" | "outline" | "dark";

export const ESTADO_VISITA_TAG: Record<EstadoVisita, TagVariant> = {
  PROGRAMADA: "neutral",
  EN_CURSO: "accent",
  COMPLETADA: "dark",
  PENDIENTE: "outline",
  REAGENDADA: "outline",
  CANCELADA: "neutral",
  CANCELADA_ADMIN: "neutral",
};

export const ESTADO_VISITA_COLOR: Record<EstadoVisita, string> = {
  PROGRAMADA: "var(--color-neutral-500)",
  EN_CURSO: "var(--color-accent)",
  COMPLETADA: "var(--color-text)",
  PENDIENTE: "var(--color-accent-400)",
  REAGENDADA: "var(--color-accent-400)",
  CANCELADA: "var(--color-neutral-400)",
  CANCELADA_ADMIN: "var(--color-neutral-500)",
};

// Barra izquierda de las tarjetas de visita (móvil): el estado más urgente resalta.
export const ESTADO_VISITA_BARRA: Record<EstadoVisita, string> = {
  PROGRAMADA: "var(--color-neutral-400)",
  EN_CURSO: "var(--color-accent)",
  COMPLETADA: "var(--color-text)",
  PENDIENTE: "var(--color-accent-400)",
  REAGENDADA: "var(--color-accent-400)",
  CANCELADA: "var(--color-neutral-400)",
  CANCELADA_ADMIN: "var(--color-neutral-500)",
};

/** Los dos estados que el sistema conoce por nombre; el resto son intermedios. */
export const ESTADO_PROBLEMA_INICIAL = "ABIERTO";
export const ESTADO_PROBLEMA_CIERRE = "RESUELTO";

/**
 * Los tres estados de siempre. Es con lo que nace la Lista 7 del Checklist y
 * lo que se usa mientras la base no tenga el catálogo (migración 016).
 */
export const ESTADOS_PROBLEMA_BASE: CatalogoEstadoProblema[] = [
  { id: null, codigo: "ABIERTO", nombre: "Abierto", orden: 1, activo: true },
  { id: null, codigo: "PENDIENTE", nombre: "Espera repuesto", orden: 2, activo: true },
  { id: null, codigo: "RESUELTO", nombre: "Resuelto", orden: 3, activo: true },
];

/** El nombre de un estado tal como está hoy en el checklist; si no está, su código. */
export function etiquetaEstadoProblema(codigo: string, catalogo: CatalogoEstadoProblema[]): string {
  return (
    catalogo.find((e) => e.codigo === codigo)?.nombre ??
    ESTADOS_PROBLEMA_BASE.find((e) => e.codigo === codigo)?.nombre ??
    codigo
  );
}

/** Abierto resalta, resuelto va oscuro y todo estado intermedio va en contorno. */
export function tagEstadoProblema(codigo: string): TagVariant {
  if (codigo === ESTADO_PROBLEMA_INICIAL) return "accent";
  return codigo === ESTADO_PROBLEMA_CIERRE ? "dark" : "outline";
}

export const ESTADO_PROBLEMA_COLOR: Record<EstadoProblema, string> = {
  ABIERTO: "var(--color-accent)",
  PENDIENTE: "var(--color-accent-400)",
  RESUELTO: "var(--color-text)",
};

/**
 * Los motivos de una visita en una línea.
 *
 * Una visita puede venir por varias cosas a la vez (dmc.visita_motivo). Donde
 * antes se pintaba `visita.motivo?.nombre` —que es solo el principal— hay que
 * usar esto para no ocultar los demás.
 */
export function textoMotivos(visita: {
  motivosNombres?: string[];
  motivo?: { nombre: string } | undefined;
  motivoCodigo?: string;
}): string {
  const lista = visita.motivosNombres?.filter(Boolean) ?? [];
  if (lista.length) return lista.join(" · ");
  return visita.motivo?.nombre ?? visita.motivoCodigo ?? "—";
}

/** Los motivos que el técnico confirmó en terreno; si no hay, los agendados. */
export function textoMotivosReales(visita: {
  motivosNombres?: string[];
  motivo?: { nombre: string } | undefined;
  motivoCodigo?: string;
  ejecucion?: { motivosRealesCodigos?: string[] } | undefined;
  motivosCodigos?: string[];
}): string {
  const reales = visita.ejecucion?.motivosRealesCodigos?.filter(Boolean) ?? [];
  if (!reales.length) return textoMotivos(visita);
  // Los reales vienen como código: se traducen con los nombres que ya tenemos.
  const porCodigo = new Map((visita.motivosCodigos ?? []).map((c, i) => [c, visita.motivosNombres?.[i] ?? c]));
  return reales.map((c) => porCodigo.get(c) ?? c).join(" · ");
}
