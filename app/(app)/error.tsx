"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Boton } from "@/components/ui/boton";

/**
 * Error dentro de la aplicación. Dice qué pasó y ofrece dos salidas
 * concretas: reintentar o volver al inicio. Nada de "algo salió mal".
 */
export default function ErrorApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-heading text-xl font-semibold text-texto">
        No pudimos cargar esta pantalla
      </h1>
      <p className="mt-2 text-sm text-suave">
        Puede ser un corte momentáneo de conexión con la base. Probá de nuevo;
        si sigue pasando, avisá a soporte y pasale el código de abajo.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Boton onClick={reset}>Reintentar</Boton>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-base border border-borde bg-superficie px-4 text-sm font-medium text-texto transition-colors hover:bg-fondo sm:min-h-10"
        >
          Volver al inicio
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-4 text-xs text-suave">
          Código de error:{" "}
          <span className="tabular-nums text-texto">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}
