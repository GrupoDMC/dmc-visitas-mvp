import { fechaCorta, fechaHoraCorta, horaCorta } from "@/lib/fechas";
import type { ReagendamientoDeVisita } from "@/lib/db/reagendamientos";

/** `03-08-2026 09:30`, o el aviso de que esta visita nació sin fecha. */
function fechaHoraAnterior(r: ReagendamientoDeVisita): string {
  const fecha = fechaCorta(r.fecha_anterior);
  if (!fecha) return "Sin fecha previa";
  const hora = horaCorta(r.hora_anterior);
  return hora ? `${fecha} ${hora}` : fecha;
}

function fechaHoraNueva(r: ReagendamientoDeVisita): string {
  const fecha = fechaCorta(r.fecha_nueva) ?? r.fecha_nueva;
  const hora = horaCorta(r.hora_nueva);
  return hora ? `${fecha} ${hora}` : fecha;
}

/**
 * Historial de reagendamientos de esta visita, más reciente primero. No se
 * muestra nada si nunca se reagendó — a diferencia del historial de la
 * sucursal (`PanelHistorial`), acá no hay "todavía no hay ninguno" que valga
 * la pena decir.
 */
export function HistorialReagendamientos({
  reagendamientos,
}: {
  reagendamientos: ReagendamientoDeVisita[];
}) {
  if (reagendamientos.length === 0) return null;

  return (
    <section
      aria-labelledby="historial-reagendamientos"
      className="rounded-base border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5"
    >
      <h2 id="historial-reagendamientos" className="text-sm font-medium text-texto">
        Reagendamientos
        <span className="ml-1.5 font-normal tabular-nums text-suave">
          ({reagendamientos.length})
        </span>
      </h2>

      <ul className="mt-3 divide-y divide-borde">
        {reagendamientos.map((r) => (
          <li key={r.id} className="py-2.5 text-sm text-texto first:pt-0 last:pb-0">
            De <span className="text-suave">{fechaHoraAnterior(r)}</span> a{" "}
            <span className="font-medium">{fechaHoraNueva(r)}</span>
            {" — "}
            {r.motivo}
            {" — "}
            {r.reagendado_por?.nombre ?? "Alguien"}
            {" · "}
            <span className="text-suave">{fechaHoraCorta(r.reagendado_en)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
