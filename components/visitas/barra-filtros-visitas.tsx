import Form from "next/form";
import Link from "next/link";
import { ESTADOS_VISITA } from "@/lib/catalogos";
import { SIN_TECNICO, type FiltrosVisitas } from "@/lib/db/visitas";

const CONTROL =
  "mt-1.5 h-10 w-full rounded-base border border-borde bg-superficie px-3 " +
  "text-base text-texto placeholder:text-suave focus:border-acento " +
  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-acento";

const ETIQUETA = "block text-sm font-medium text-texto";

/**
 * Los cinco filtros del listado de coordinación, todos en la URL.
 *
 * Es un `<Form>` de Next con action en string: se envía por GET, los valores
 * quedan en los search params y el link filtrado se puede pegar en un chat —
 * que es justo para lo que se pidió. Anda sin JavaScript y el botón atrás
 * funciona.
 *
 * El `key` no es decorativo, y acá pesa más que en los maestros porque son
 * cinco controles: los campos son no controlados, y navegar de un filtro a otro
 * es una transición del lado del cliente donde React reconcilia los MISMOS
 * elementos. `defaultValue` solo se aplica al montar, así que sin el `key` la
 * URL diría una cosa y los selects mostrarían otra.
 */
export function BarraFiltrosVisitas({
  filtros,
  clientes,
  tecnicos,
}: {
  filtros: FiltrosVisitas;
  clientes: { id: number; razon_social: string }[];
  tecnicos: { id: number; nombres: string; apellidos: string }[];
}) {
  const hayFiltro = Object.values(filtros).some(Boolean);

  return (
    <Form
      action="/visitas"
      key={Object.values(filtros).join("|")}
      className="mb-4 rounded-card border border-borde bg-superficie p-3 shadow-tarjeta"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="q" className={ETIQUETA}>
            Buscar
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filtros.busqueda}
            placeholder="Folio, cliente o sucursal"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={CONTROL}
          />
        </div>

        <div>
          <label htmlFor="desde" className={ETIQUETA}>
            Desde
          </label>
          <input
            id="desde"
            name="desde"
            type="date"
            defaultValue={filtros.desde}
            className={CONTROL}
          />
        </div>

        <div>
          <label htmlFor="hasta" className={ETIQUETA}>
            Hasta
          </label>
          <input
            id="hasta"
            name="hasta"
            type="date"
            defaultValue={filtros.hasta}
            className={CONTROL}
          />
        </div>

        <div>
          <label htmlFor="estado" className={ETIQUETA}>
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={filtros.estado}
            className={CONTROL}
          >
            <option value="">Todos</option>
            {ESTADOS_VISITA.map((estado) => (
              <option key={estado.codigo} value={estado.codigo}>
                {estado.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tecnico" className={ETIQUETA}>
            Técnico
          </label>
          <select
            id="tecnico"
            name="tecnico"
            defaultValue={filtros.tecnico}
            className={CONTROL}
          >
            <option value="">Todos</option>
            {/* El filtro más usado del listado: lo que falta repartir. */}
            <option value={SIN_TECNICO}>Sin asignar</option>
            {tecnicos.map((tecnico) => (
              <option key={tecnico.id} value={tecnico.id}>
                {tecnico.apellidos}, {tecnico.nombres}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="cliente" className={ETIQUETA}>
            Cliente
          </label>
          <select
            id="cliente"
            name="cliente"
            defaultValue={filtros.cliente}
            className={CONTROL}
          >
            <option value="">Todos</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.razon_social}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-base bg-acento px-4 text-sm font-medium text-white transition-colors hover:bg-acento-hover sm:min-h-10 sm:flex-none"
        >
          Aplicar filtros
        </button>
        {hayFiltro ? (
          <Link
            href="/visitas"
            className="inline-flex min-h-11 items-center justify-center rounded-base border border-borde px-4 text-sm font-medium text-texto transition-colors hover:bg-fondo sm:min-h-10"
          >
            Limpiar
          </Link>
        ) : null}
      </div>
    </Form>
  );
}
