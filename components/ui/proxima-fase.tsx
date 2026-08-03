import Link from "next/link";

/**
 * Marcador de pantalla todavía no construida. No es un estado vacío: acá no
 * hay nada que crear aún, y decirlo derecho evita que alguien reporte como
 * error algo que simplemente no se hizo todavía.
 */
export function ProximaFase({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold text-texto">{titulo}</h1>
      <div className="mt-4 rounded-base border border-borde bg-superficie p-5 shadow-tarjeta">
        <p className="text-sm text-texto">{descripcion}</p>
        <p className="mt-2 text-sm text-suave">
          Mientras tanto, el registro sigue en la hoja física.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-11 items-center rounded-base border border-borde px-3 text-sm text-texto transition-colors hover:bg-fondo sm:min-h-10"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
