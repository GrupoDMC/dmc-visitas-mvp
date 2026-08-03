import type { ReactNode } from "react";

/**
 * Tabla de listado. Filas de 44px, cabecera fija en gris, sin cebra: la
 * separación la hace la línea, no el fondo.
 *
 * Las columnas secundarias se ocultan bajo `sm` con `soloAncha` en vez de
 * empujar la tabla a scroll horizontal. A 360px se ve menos, pero se lee.
 */
export function Tabla({
  cabecera,
  children,
}: {
  cabecera: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-base border border-borde bg-superficie shadow-tarjeta">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-borde bg-fondo">
          <tr>{cabecera}</tr>
        </thead>
        <tbody className="divide-y divide-borde">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  children,
  soloAncha,
  numerica,
}: {
  children: ReactNode;
  soloAncha?: boolean;
  numerica?: boolean;
}) {
  return (
    <th
      scope="col"
      className={[
        "px-3 py-2.5 text-left text-xs font-medium text-suave",
        numerica ? "tabular-nums" : "",
        soloAncha ? "hidden sm:table-cell" : "",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

export function Fila({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={`h-11 transition-colors hover:bg-fondo ${className}`}>
      {children}
    </tr>
  );
}

export function Td({
  children,
  soloAncha,
  numerica,
  className = "",
}: {
  children: ReactNode;
  soloAncha?: boolean;
  numerica?: boolean;
  className?: string;
}) {
  return (
    <td
      className={[
        "px-3 py-2 align-middle text-texto",
        numerica ? "tabular-nums" : "",
        soloAncha ? "hidden sm:table-cell" : "",
        className,
      ].join(" ")}
    >
      {children}
    </td>
  );
}

/** Lo que va en una celda cuando el dato opcional no se cargó. */
export function SinDato() {
  return (
    <span className="text-suave" aria-label="sin dato">
      —
    </span>
  );
}
