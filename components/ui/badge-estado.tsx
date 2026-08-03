import type { EstadoVisita } from "@/lib/db/tipos";

/**
 * Badge de estado: punto de color + texto. Fondo neutro, nunca saturado.
 * El color acompaña, no informa por sí solo — quien no distingue los tonos
 * lee exactamente lo mismo.
 *
 * Nota: la dirección visual definió color para PROGRAMADA, EN_CURSO,
 * REALIZADA y PENDIENTE. REAGENDADA y CANCELADA existen en
 * cat_estado_visita pero no tenían color asignado; van en gris hasta que
 * se defina uno.
 */
const ESTADOS: Record<EstadoVisita, { texto: string; punto: string }> = {
  PROGRAMADA: { texto: "Programada", punto: "bg-programada" },
  EN_CURSO: { texto: "En curso", punto: "bg-encurso" },
  REALIZADA: { texto: "Realizada", punto: "bg-realizada" },
  PENDIENTE: { texto: "Pendiente", punto: "bg-pendiente" },
  REAGENDADA: { texto: "Reagendada", punto: "bg-reagendada" },
  CANCELADA: { texto: "Cancelada", punto: "bg-cancelada" },
};

export function BadgeEstado({ estado }: { estado: EstadoVisita }) {
  const { texto, punto } = ESTADOS[estado];

  return (
    <span className="inline-flex items-center gap-1.5 rounded-base border border-borde bg-superficie px-2 py-0.5 text-xs font-medium text-texto">
      <span className={`size-1.5 shrink-0 rounded-full ${punto}`} aria-hidden />
      {texto}
    </span>
  );
}
