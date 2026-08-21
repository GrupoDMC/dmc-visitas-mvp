import type { EstadoVisita, EstadoProblema } from "@/lib/types";

export const ESTADO_VISITA_LABEL: Record<EstadoVisita, string> = {
  PROGRAMADA: "Programada",
  EN_CURSO: "En curso",
  COMPLETADA: "Completada",
  PENDIENTE: "Pendiente",
  REAGENDADA: "Reagendada",
  CANCELADA: "Cancelada",
};

export type TagVariant = "accent" | "neutral" | "outline" | "dark";

export const ESTADO_VISITA_TAG: Record<EstadoVisita, TagVariant> = {
  PROGRAMADA: "neutral",
  EN_CURSO: "accent",
  COMPLETADA: "dark",
  PENDIENTE: "outline",
  REAGENDADA: "outline",
  CANCELADA: "neutral",
};

export const ESTADO_VISITA_COLOR: Record<EstadoVisita, string> = {
  PROGRAMADA: "var(--color-neutral-500)",
  EN_CURSO: "var(--color-accent)",
  COMPLETADA: "var(--color-text)",
  PENDIENTE: "var(--color-accent-400)",
  REAGENDADA: "var(--color-accent-400)",
  CANCELADA: "var(--color-neutral-400)",
};

// Barra izquierda de las tarjetas de visita (móvil): el estado más urgente resalta.
export const ESTADO_VISITA_BARRA: Record<EstadoVisita, string> = {
  PROGRAMADA: "var(--color-neutral-400)",
  EN_CURSO: "var(--color-accent)",
  COMPLETADA: "var(--color-text)",
  PENDIENTE: "var(--color-accent-400)",
  REAGENDADA: "var(--color-accent-400)",
  CANCELADA: "var(--color-neutral-400)",
};

export const ESTADO_PROBLEMA_LABEL: Record<EstadoProblema, string> = {
  ABIERTO: "Abierto",
  PENDIENTE: "Pendiente",
  RESUELTO: "Resuelto",
};

export const ESTADO_PROBLEMA_TAG: Record<EstadoProblema, TagVariant> = {
  ABIERTO: "accent",
  PENDIENTE: "outline",
  RESUELTO: "dark",
};

export const ESTADO_PROBLEMA_COLOR: Record<EstadoProblema, string> = {
  ABIERTO: "var(--color-accent)",
  PENDIENTE: "var(--color-accent-400)",
  RESUELTO: "var(--color-text)",
};
