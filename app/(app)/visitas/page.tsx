import Link from "next/link";
import type { Metadata } from "next";
import { esTecnico, requerirSesion, type Sesion } from "@/lib/auth";
import { hoyEnChile } from "@/lib/fechas";
import { leerPagina, unico } from "@/lib/paginacion";
import { Encabezado, } from "@/components/ui/encabezado";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { BarraFiltrosVisitas } from "@/components/visitas/barra-filtros-visitas";
import { ChipsFiltrosActivos } from "@/components/visitas/chips-filtros-activos";
import { TarjetasTecnico } from "@/components/visitas/tarjetas-tecnico";
import { SectionCards } from "@/components/section-cards";
import { DataTable } from "@/components/data-table";
import visitasData from "@/mocks/visitas.json"
import tecnicosData from "@/mocks/tecnicos.json"
import clientesData from "@/mocks/clientes.json"
import { Fab } from "@/components/fab";

export const metadata: Metadata = { title: "Visitas" };

type Params = Promise<{ [clave: string]: string | string[] | undefined }>;

export default async function PaginaVisitas({ searchParams }: { searchParams: Params;}) {
  const sesion = await requerirSesion();
  if (esTecnico(sesion)) return <VistaTecnico sesion={sesion} />;
  return <VistaCoordinacion searchParams={searchParams} />;
}

// ---------------------------------------------------------------------------
// COORDINACIÓN
// ---------------------------------------------------------------------------

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

  return (
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4  md:gap-6">
              <BarraFiltrosVisitas filtros={filtros} clientes={clientesData} tecnicos={tecnicosData}/>
              <SectionCards />
              <DataTable data={visitasData} />
              <Fab url="/visitas/nueva-visita"/>
            </div>
          </div>
        </div>
        {/* <ChipsFiltrosActivos filtros={filtros} clientes={clientes} tecnicos={tecnicos} /> */}
      </div>
  );
}

// ---------------------------------------------------------------------------
// TÉCNICO
// ---------------------------------------------------------------------------

async function VistaTecnico({ sesion }: { sesion: Sesion }) {
  // El esquema obliga a que un perfil TECNICO tenga técnico vinculado
  // (`ck_perfil_tecnico`), pero el tipo dice que puede ser null y de un dato
  // que no debería pasar tampoco se puede sacar una consulta.
  if (sesion.tecnicoId === null) {
    return (
      <div className="mx-auto max-w-2xl">
        <Encabezado titulo="Mis visitas" />
        <EstadoVacio
          titulo="Tu usuario no está vinculado a ningún técnico"
          descripcion="Sin ese vínculo no hay forma de saber qué visitas son tuyas. Pedile a administración que lo corrija."
        />
      </div>
    );
  }

  const hoy = hoyEnChile();
  // const visitas = await visitasAbiertasDeTecnico(sesion.tecnicoId);

  return (
    // El espacio de abajo es para el botón fijo: sin él, la última tarjeta
    // queda tapada justo cuando el técnico llega al final de la lista.
    <div className="mx-auto max-w-2xl pb-20">
      <Encabezado
        titulo="Mis visitas"
        descripcion="Lo que tenés abierto. Tocá una para registrar lo que hiciste."
      />
{/* 
      {visitas.length === 0 ? (
        <EstadoVacio
          titulo="No tenés visitas pendientes"
          descripcion="Cuando coordinación te asigne trabajo aparece acá. Si llegaste a un lugar sin visita agendada, abrila vos mismo."
          accion={{
            href: "/visitas/en-terreno",
            etiqueta: "Nueva visita en terreno",
          }}
        />
      ) : (
        <TarjetasTecnico visitas={visitas} hoy={hoy} />
      )} */}

      {/* Fijo abajo y a mano: el técnico que llega a un lugar sin agendamiento
          previo no tiene que buscar nada en un menú. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/visitas/en-terreno"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-base bg-acento px-4 text-sm font-medium text-white transition-colors hover:bg-acento-hover"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M10 4v12M4 10h12" />
            </svg>
            Nueva visita en terreno
          </Link>
        </div>
      </div>
    </div>
  );
}
