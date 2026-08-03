import { nombreEstado } from "@/lib/catalogos";
import type { EstadoVisita } from "@/lib/db/tipos";

/**
 * Badge de estado: punto de color + fondo suave + texto. El color nunca va
 * solo — quien no distingue los tonos lee exactamente lo mismo por el texto.
 *
 * El texto sale de `lib/catalogos.ts`, que es la única lista de estados de la
 * app: acá se decide cómo se pinta, no cómo se llama.
 */
const ESTILOS: Record<EstadoVisita, { punto: string; fondo: string; texto: string }> = {
  PROGRAMADA: { punto: "bg-programada", fondo: "bg-programada-fondo", texto: "text-programada-texto" },
  EN_CURSO: { punto: "bg-encurso", fondo: "bg-encurso-fondo", texto: "text-encurso-texto" },
  REALIZADA: { punto: "bg-realizada", fondo: "bg-realizada-fondo", texto: "text-realizada-texto" },
  PENDIENTE: { punto: "bg-pendiente", fondo: "bg-pendiente-fondo", texto: "text-pendiente-texto" },
  REAGENDADA: { punto: "bg-reagendada", fondo: "bg-reagendada-fondo", texto: "text-reagendada-texto" },
  CANCELADA: { punto: "bg-cancelada", fondo: "bg-cancelada-fondo", texto: "text-cancelada-texto" },
};

export function BadgeEstado({ estado }: { estado: EstadoVisita }) {
  const texto = nombreEstado(estado);
  const estilo = ESTILOS[estado];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-base px-2 py-0.5 text-xs font-medium ${estilo.fondo} ${estilo.texto}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${estilo.punto}`} aria-hidden />
      {texto}
    </span>
  );
}
