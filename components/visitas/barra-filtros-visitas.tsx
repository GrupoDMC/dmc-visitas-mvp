import Form from "next/form";
import { ESTADOS_VISITA } from "@/lib/catalogos";
import { SIN_TECNICO, type FiltrosVisitas } from "@/lib/db/visitas";

interface ClienteProps { id: number; razonSocial: string }
interface TecnicoProps { id: number; nombres: string; apellidos: string }
const CONTROL =
  "mt-1.5 h-10 w-full rounded-base border border-borde bg-superficie px-3 " +
  "text-base text-texto placeholder:text-suave focus:border-acento " +
  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-acento";

const ETIQUETA = "block text-sm font-medium text-texto";


export function BarraFiltrosVisitas({ filtros, clientes, tecnicos }: { filtros: FiltrosVisitas; clientes: ClienteProps[]; tecnicos: TecnicoProps[] }) {

  return (
    <Form action="/visitas" key={Object.values(filtros).join("|")} className="rounded-card border border-borde bg-superficie p-3 shadow-tarjeta">
      <div className="grid grid-cols-4 gap-3">
        {/* fila 1: buscador y cliente  */}
        <div className="col-span-3">
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

        <div className="col-span-1">
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
            {clientes.map((cliente: ClienteProps) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.razonSocial}
              </option>
            ))}
          </select>
        </div>

        {/* Fila 2: filtros*/}

        <div className="col-span-1">
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

        <div className="col-span-1">
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
            {tecnicos.map((tecnico: TecnicoProps) => (
              <option key={tecnico.id} value={tecnico.id}>
                {tecnico.apellidos}, {tecnico.nombres}
              </option>
            ))}
          </select>
        </div>

        {/* Fechas */}
        
        <div className="col-span-1">
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

        <div className="col-span-1">
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
      </div>
    </Form>
  );
}
