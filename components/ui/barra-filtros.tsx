import Form from "next/form";
import Link from "next/link";

type ContentDDL = {
  NOMBRE: string,
  CODIGO: string,
}

interface filtrosProps { 
  base: string;
  busqueda: string;
  estado: string;
  etiquetaBusqueda: string;
  ayudaBusqueda: string;
  ddlProp: ContentDDL[]
}

export function BarraFiltros({ base, busqueda, estado, etiquetaBusqueda, ayudaBusqueda, ddlProp }: filtrosProps ) {
  const hayFiltro = Boolean(busqueda) || (estado !== "" && estado !== "activos");
  return (
    <Form action={base} key={`${busqueda}|${estado}`} className="mb-4 flex flex-col gap-2 rounded-card border border-borde bg-superficie p-3 shadow-tarjeta sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="busqueda" className="block text-sm font-medium text-texto" >
          {etiquetaBusqueda}
        </label>
        <input
          id="busqueda" name="busqueda"
          type="search" defaultValue={busqueda}
          placeholder={ayudaBusqueda} autoCapitalize="none"
          autoCorrect="off" spellCheck={false}
          className="mt-1.5 h-10 w-full rounded-base border border-borde bg-superficie px-3 text-base text-texto placeholder:text-suave focus:border-acento focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        />
      </div>

      <div className="sm:w-52">
        <label htmlFor="estado" className="block text-sm font-medium text-texto">
          Mostrar
        </label>
        <select id="estado" name="estado" defaultValue={estado || "activos"} className="mt-1.5 h-10 w-full rounded-base border border-borde bg-superficie px-3 text-base text-texto focus:border-acento focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento">
          {
            ddlProp.map((item, index) => (
              <option key={index} value={item.CODIGO}>{item.NOMBRE}</option>
            ))
          }
        </select>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-base bg-acento px-4 text-sm font-medium text-white transition-colors hover:bg-acento-hover sm:min-h-10 sm:flex-none">
          Buscar
        </button>
        {hayFiltro ? (
          <Link href={base} className="inline-flex min-h-11 items-center justify-center rounded-base border border-borde px-4 text-sm font-medium text-texto transition-colors hover:bg-fondo sm:min-h-10">
            Limpiar
          </Link>
        ) : null}
      </div>
    </Form>
  );
}
