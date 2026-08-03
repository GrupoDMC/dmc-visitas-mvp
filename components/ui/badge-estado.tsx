import { nombreEstado } from "@/lib/catalogos";
import type { EstadoVisita } from "@/lib/db/tipos";

/**
 * Badge de estado: punto de color + texto. Fondo neutro, nunca saturado.
 * El color acompaña, no informa por sí solo — quien no distingue los tonos
 * lee exactamente lo mismo.
 *
 * Nota: la dirección visual definió color para PROGRAMADA, EN_CURSO,
 * REALIZADA y PENDIENTE. REAGENDADA y CANCELADA existen en
 * cat_estado_visita y llevan un color provisorio (ver `app/globals.css`).
 *
 * El texto sale de `lib/catalogos.ts`, que es la única lista de estados de la
 * app: acá se decide cómo se pinta, no cómo se llama.
 */
const PUNTOS: Record<EstadoVisita, string> = {
  PROGRAMADA: "bg-programada",
  EN_CURSO: "bg-encurso",
  REALIZADA: "bg-realizada",
  PENDIENTE: "bg-pendiente",
  REAGENDADA: "bg-reagendada",
  CANCELADA: "bg-cancelada",
};

export function BadgeEstado({ estado }: { estado: EstadoVisita }) {
  const texto = nombreEstado(estado);
  const punto = PUNTOS[estado];

  return (
    <span className="inline-flex items-center gap-1.5 rounded-base border border-borde bg-superficie px-2 py-0.5 text-xs font-medium text-texto">
      <span className={`size-1.5 shrink-0 rounded-full ${punto}`} aria-hidden />
      {texto}
    </span>
  );
}
