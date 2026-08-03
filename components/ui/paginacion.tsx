import Link from "next/link";
import { POR_PAGINA } from "@/lib/paginacion";

/**
 * Paginación de listado. Anterior / siguiente y el conteo real, sin números de
 * página: con 25 por hoja y buscador arriba, saltar a la página 7 no es algo
 * que nadie haga.
 *
 * `filtros` son los search params vigentes. Van en cada enlace para que
 * paginar no borre lo que el coordinador venía filtrando.
 */
export function Paginacion({
  base,
  filtros,
  pagina,
  paginas,
  total,
  unidad,
}: {
  base: string;
  filtros: Record<string, string>;
  pagina: number;
  paginas: number;
  total: number;
  unidad: { singular: string; plural: string };
}) {
  function href(destino: number): string {
    const params = new URLSearchParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor) params.set(clave, valor);
    }
    if (destino > 1) params.set("pagina", String(destino));
    const cadena = params.toString();
    return cadena ? `${base}?${cadena}` : base;
  }

  const desde = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const hasta = Math.min(pagina * POR_PAGINA, total);

  const clases =
    "flex min-h-11 items-center rounded-base border border-borde bg-superficie " +
    "px-3 text-sm text-texto transition-colors hover:bg-fondo sm:min-h-10";

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-suave">
        {total === 0 ? (
          `Sin ${unidad.plural}`
        ) : (
          <>
            <span className="tabular-nums">
              {desde}–{hasta}
            </span>{" "}
            de <span className="tabular-nums">{total}</span>{" "}
            {total === 1 ? unidad.singular : unidad.plural}
          </>
        )}
      </p>

      {paginas > 1 ? (
        <nav aria-label="Paginación" className="flex items-center gap-2">
          {pagina > 1 ? (
            <Link href={href(pagina - 1)} rel="prev" className={clases}>
              Anterior
            </Link>
          ) : (
            <span className={`${clases} cursor-not-allowed text-suave`} aria-hidden>
              Anterior
            </span>
          )}

          <span className="px-1 text-xs tabular-nums text-suave">
            {pagina} / {paginas}
          </span>

          {pagina < paginas ? (
            <Link href={href(pagina + 1)} rel="next" className={clases}>
              Siguiente
            </Link>
          ) : (
            <span className={`${clases} cursor-not-allowed text-suave`} aria-hidden>
              Siguiente
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
