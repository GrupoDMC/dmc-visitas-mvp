
import { CardVisita } from "./card-visita";
import { Sesion } from "@/lib/auth";
import { visitasAbiertasDeTecnico } from "@/lib/db/visitas";
import { BarraFiltros } from "../ui/barra-filtros";
import { ESTADOS_VISITA } from "@/lib/catalogos";
import { EstadoVisita } from "@/lib/db/tipos";


type ContentDDL = {
  codigo: EstadoVisita,
  nombre: string,
}


async function VistaTecnico({ sesion }: { sesion: Sesion }) {
  // declaraciones
  const tecnicoId = Number(sesion?.tecnicoId);
  const estadosDDL: ContentDDL[] = ESTADOS_VISITA.map(e => ({
    codigo: e.codigo,
    nombre: e.nombre,
  }))
  // validacion de usuario
  if (!tecnicoId) {
    throw new Error("tecnicoId inválido");
  }  
  const visitas = await visitasAbiertasDeTecnico(tecnicoId);
  return (
    <div className="pb-20">
      <BarraFiltros base="/tecnicos" busqueda={""} estado={"estado"} etiquetaBusqueda="Buscar Visita" ayudaBusqueda="Filtrar visita por Cliente o Mall" ddlProp={estadosDDL}/>
      <div className="flex justify-center">
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {
            visitas.map((visita) => (
              <CardVisita key={visita.id} {...visita}/>
            ))
          }
        </div>
      </div>
      {/* <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Link href="/visitas/en-terreno" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-base bg-acento px-4 text-sm font-medium text-white transition-colors hover:bg-acento-hover" >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
              <path d="M10 4v12M4 10h12" />
            </svg>
            Nueva visita en terreno
          </Link>
        </div>
      </div> */}
    </div>
  );
}

export default VistaTecnico