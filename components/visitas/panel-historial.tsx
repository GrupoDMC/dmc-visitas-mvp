import Link from "next/link";
import { nombreTipoTrabajo } from "@/lib/catalogos";
import { fechaCorta } from "@/lib/fechas";
import type { VisitaEnListado } from "@/lib/db/visitas";
import { BadgeEstado } from "@/components/ui/badge-estado";

/**
 * Las últimas cinco visitas a esta misma sucursal.
 *
 * Es lo primero que un técnico quiere saber al llegar: si alguien ya vino por
 * lo mismo la semana pasada, y cómo terminó.
 *
 * Es un `<details>` nativo abierto por defecto: en escritorio queda como panel
 * al costado, en móvil como acordeón que se puede plegar para llegar antes al
 * formulario. Empieza abierto en los dos porque es lo que se mira al llegar,
 * no algo que haya que ir a buscar.
 *
 * Nativo y no un componente con estado a propósito: anda sin JavaScript, que es
 * la condición real de un celular con mala señal.
 */
export function PanelHistorial({
  visitas,
  sucursal,
}: {
  visitas: VisitaEnListado[];
  sucursal: string;
}) {
  return (
    <details
      open
      className="group rounded-card border border-borde bg-superficie shadow-tarjeta"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-heading text-sm font-semibold text-texto">
        Historial de la sucursal
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-suave transition-transform group-open:rotate-180"
          aria-hidden
        >
          <path d="M6 8l4 4 4-4" />
        </svg>
      </summary>

      {visitas.length === 0 ? (
        <p className="border-t border-borde px-4 py-3 text-sm text-suave">
          Es la primera visita registrada en {sucursal}.
        </p>
      ) : (
        <ul className="divide-y divide-borde border-t border-borde">
          {visitas.map((visita) => {
            const trabajo = nombreTipoTrabajo(visita.tipo_trabajo);

            return (
              <li key={visita.id}>
                <Link
                  href={`/visitas/${visita.id}`}
                  className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-fondo"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm tabular-nums text-texto">
                      {fechaCorta(visita.fecha_programada) ?? "Sin fecha"}
                    </span>
                    <BadgeEstado estado={visita.estado} />
                  </div>
                  <span className="text-xs text-suave">
                    {visita.tecnico
                      ? `${visita.tecnico.apellidos}, ${visita.tecnico.nombres}`
                      : "Sin técnico"}
                    {trabajo ? ` · ${trabajo}` : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
