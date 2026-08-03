import Link from "next/link";

export default function NoEncontrada() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="text-xs font-medium tabular-nums text-suave">Error 404</p>
        <h1 className="mt-1 font-heading text-xl font-semibold text-texto">
          Esta página no existe
        </h1>
        <p className="mt-2 text-sm text-suave">
          Puede que el enlace esté mal escrito o que la visita que buscabas se
          haya eliminado.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-11 items-center rounded-base bg-acento px-4 text-sm font-medium text-white transition-colors hover:bg-acento-hover sm:min-h-10"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
