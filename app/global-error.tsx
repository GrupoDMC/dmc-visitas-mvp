"use client";

import "./globals.css";

/**
 * Última red de contención: se usa solo si falla el layout raíz, así que
 * tiene que traer su propio <html> y <body> y no depender de nada más.
 */
export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es-CL">
      <body className="min-h-dvh bg-fondo font-sans text-texto antialiased">
        <main className="flex min-h-dvh items-center justify-center px-4 py-10">
          <div className="w-full max-w-md">
            <h1 className="text-xl font-semibold">
              La aplicación no pudo iniciarse
            </h1>
            <p className="mt-2 text-sm text-suave">
              Recargá la página. Si el problema sigue, avisá a soporte con el
              código de abajo.
            </p>

            <button
              type="button"
              onClick={reset}
              className="mt-4 inline-flex min-h-11 items-center rounded-base bg-acento px-4 text-sm font-medium text-white transition-colors hover:bg-acento-hover sm:min-h-10"
            >
              Recargar
            </button>

            {error.digest ? (
              <p className="mt-4 text-xs text-suave">
                Código de error:{" "}
                <span className="tabular-nums">{error.digest}</span>
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
