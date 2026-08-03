/**
 * Activo / inactivo. Mismo criterio que el badge de estado de visita: el color
 * acompaña al texto, nunca lo reemplaza.
 *
 * Un registro inactivo no desapareció — sigue en los listados y en las visitas
 * viejas. Solo dejó de ofrecerse para cosas nuevas, y eso es lo que dice.
 */
export function BadgeActivo({ activo }: { activo: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-base border border-borde bg-superficie px-2 py-0.5 text-xs font-medium text-texto">
      <span
        className={`size-1.5 shrink-0 rounded-full ${
          activo ? "bg-realizada" : "bg-cancelada"
        }`}
        aria-hidden
      />
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}
