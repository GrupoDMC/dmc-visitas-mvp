import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Encabezado de pantalla: migas, título y la acción principal a la derecha.
 * En móvil la acción baja debajo del título en vez de apretarse al lado.
 */
export function Encabezado({
  titulo,
  descripcion,
  volverA,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  volverA?: { href: string; etiqueta: string };
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-4">
      {volverA ? (
        <Link
          href={volverA.href}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-acento hover:underline"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 15l-5-5 5-5" />
          </svg>
          {volverA.etiqueta}
        </Link>
      ) : null}

      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-xl font-semibold text-texto">{titulo}</h1>
          {descripcion ? (
            <p className="mt-1 text-sm text-suave">{descripcion}</p>
          ) : null}
        </div>
        {acciones ? (
          <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Enlace con aspecto de botón primario. Para las acciones que navegan. */
export function EnlaceBoton({
  href,
  children,
  variante = "primario",
}: {
  href: string;
  children: ReactNode;
  variante?: "primario" | "secundario";
}) {
  const estilo =
    variante === "primario"
      ? "bg-acento text-white hover:bg-acento-hover"
      : "border border-borde bg-superficie text-texto hover:bg-fondo";

  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-base px-4 text-sm font-medium transition-colors sm:min-h-10 ${estilo}`}
    >
      {children}
    </Link>
  );
}
