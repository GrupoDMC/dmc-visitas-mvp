import { nombreEstado, nombreTipoTrabajo } from "@/lib/catalogos";
import { clientesActivos } from "@/lib/db/clientes";
import { tecnicosActivos } from "@/lib/db/tecnicos";
import { contarVisitasPorEstado, FiltrosVisitas, listarVisitas } from "@/lib/db/visitas";
import { fechaCorta } from "@/lib/fechas";
import { leerPagina, unico } from "@/lib/paginacion";
import { ChipsFiltrosActivos } from "./chips-filtros-activos";
import { BarraFiltrosVisitas } from "./barra-filtros-visitas";
import { SectionCards } from "../section-cards";
import { DataTable } from "../data-table";
import { Fab } from "../fab";
type Params = Promise<{ [clave: string]: string | string[] | undefined }>;


async function VistaCoordinacion({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;

  // Los filtros viven en la URL, no en estado: un listado filtrado se comparte
  // pegando el link, y el botón atrás del navegador vuelve al filtro anterior.
  const filtros: FiltrosVisitas = {
    busqueda: unico(params.q),
    desde: unico(params.desde),
    hasta: unico(params.hasta),
    estado: unico(params.estado),
    tecnico: unico(params.tecnico),
    cliente: unico(params.cliente),
  };

  const pagina = leerPagina(params.pagina);

  const [listado, tecnicos, clientes, conteos] = await Promise.all([
    listarVisitas(filtros, pagina),
    tecnicosActivos(),
    clientesActivos(),
    contarVisitasPorEstado(),
  ]);

  // La tabla se armó contra el shape de mocks/visitas.json (plano, con
  // etiquetas ya traducidas); acá se adapta lo que devuelve el listado real.
  const filas = listado.filas.map((visita) => ({
    id: visita.id,
    folio: visita.folio,
    fecha: fechaCorta(visita.fecha_programada) ?? "Sin fecha",
    cliente: visita.cliente?.razon_social ?? "—",
    sucursal: visita.sucursal?.nombre ?? "—",
    comuna: visita.sucursal?.comuna ?? "—",
    trabajo: nombreTipoTrabajo(visita.tipo_trabajo) ?? "—",
    tecnico: visita.tecnico ? `${visita.tecnico.nombres} ${visita.tecnico.apellidos}` : "",
    estado: nombreEstado(visita.estado),
  }));

  return (
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4  md:gap-6">
              <BarraFiltrosVisitas filtros={filtros} clientes={clientes} tecnicos={tecnicos}/>
              <SectionCards conteos={conteos} />
              <DataTable data={filas} />
              <Fab url="/visitas/nueva-visita"/>
            </div>
          </div>
        </div>
        <ChipsFiltrosActivos filtros={filtros} clientes={clientes} tecnicos={tecnicos} />
      </div>
  );
}

export default VistaCoordinacion