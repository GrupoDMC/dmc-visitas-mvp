import Form from "next/form";
import Link from "next/link";

/**
 * Buscador + filtro activo/inactivo de los listados.
 *
 * Es un `<Form>` de Next con action en string: se envía por GET y los valores
 * quedan en la URL. Eso da tres cosas gratis — el link filtrado se puede
 * compartir, el botón atrás del navegador funciona, y anda sin JavaScript.
 *
 * El `pagina` no se arrastra a propósito: cambiar el filtro y quedar en la
 * página 4 de un resultado de 12 filas es un vacío que parece un error.
 */
export function BarraFiltros({
  base,
  busqueda,
  estado,
  etiquetaBusqueda,
  ayudaBusqueda,
}: {
  base: string;
  busqueda: string;
  estado: string;
  etiquetaBusqueda: string;
  ayudaBusqueda: string;
}) {
  const hayFiltro = Boolean(busqueda) || (estado !== "" && estado !== "activos");

  return (
    <Form
      action={base}
      // El `key` no es decorativo. Los controles son no controlados, y navegar
      // a otro filtro (por ejemplo desde el enlace "Ver los inactivos") es una
      // transición del lado del cliente: React reconcilia el MISMO <select> y
      // los cambios de `defaultValue` sobre un campo ya montado se ignoran.
      // Resultado sin esto: la URL dice `inactivos`, la tabla muestra los
      // inactivos, y el select sigue diciendo "Solo activos".
      // Cambiar el key lo remonta y los valores vuelven a tomarse de la URL.
      key={`${busqueda}|${estado}`}
      className="mb-4 flex flex-col gap-2 rounded-base border border-borde bg-superficie p-3 shadow-tarjeta sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label
          htmlFor="q"
          className="block text-sm font-medium text-texto"
        >
          {etiquetaBusqueda}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={busqueda}
          placeholder={ayudaBusqueda}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="mt-1.5 h-10 w-full rounded-base border border-borde bg-superficie px-3 text-base text-texto placeholder:text-suave focus:border-acento focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        />
      </div>

      <div className="sm:w-52">
        <label htmlFor="estado" className="block text-sm font-medium text-texto">
          Mostrar
        </label>
        <select
          id="estado"
          name="estado"
          defaultValue={estado || "activos"}
          className="mt-1.5 h-10 w-full rounded-base border border-borde bg-superficie px-3 text-base text-texto focus:border-acento focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
          <option value="todos">Activos e inactivos</option>
        </select>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-base bg-acento px-4 text-sm font-medium text-white transition-colors hover:bg-acento-hover sm:min-h-10 sm:flex-none"
        >
          Buscar
        </button>
        {hayFiltro ? (
          <Link
            href={base}
            className="inline-flex min-h-11 items-center justify-center rounded-base border border-borde px-4 text-sm font-medium text-texto transition-colors hover:bg-fondo sm:min-h-10"
          >
            Limpiar
          </Link>
        ) : null}
      </div>
    </Form>
  );
}
