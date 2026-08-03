import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Estado vacío. Nunca "No hay datos": siempre dice por qué está vacío y qué
 * hacer al respecto, con el botón para hacerlo ahí mismo.
 */
export function EstadoVacio({
  titulo,
  descripcion,
  accion,
  children,
}: {
  titulo: string;
  descripcion: string;
  accion?: { href: string; etiqueta: string };
  children?: ReactNode;
}) {
  return (
    <div className="rounded-base border border-borde bg-superficie px-5 py-10 text-center shadow-tarjeta">
      <p className="text-sm font-medium text-texto">{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-suave">{descripcion}</p>
      {accion ? (
        <Link
          href={accion.href}
          className="mt-4 inline-flex min-h-11 items-center rounded-base bg-acento px-4 text-sm font-medium text-white transition-colors hover:bg-acento-hover sm:min-h-10"
        >
          {accion.etiqueta}
        </Link>
      ) : null}
      {children}
    </div>
  );
}
