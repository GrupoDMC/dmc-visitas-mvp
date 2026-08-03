import Link from "next/link";
import type { Metadata } from "next";
import { esTecnico, requerirSesion, type Sesion } from "@/lib/auth";
import { hoyEnChile } from "@/lib/fechas";
import { leerPagina, unico } from "@/lib/paginacion";
import { clientesActivos } from "@/lib/db/clientes";
import { tecnicosActivos } from "@/lib/db/tecnicos";
import {
  hayAlgunaVisita,
  listarVisitas,
  visitasAbiertasDeTecnico,
  type FiltrosVisitas,
} from "@/lib/db/visitas";
import { Encabezado, EnlaceBoton } from "@/components/ui/encabezado";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Paginacion } from "@/components/ui/paginacion";
import { BarraFiltrosVisitas } from "@/components/visitas/barra-filtros-visitas";
import { TablaVisitas } from "@/components/visitas/tabla-visitas";
import { TarjetasTecnico } from "@/components/visitas/tarjetas-tecnico";

export const metadata: Metadata = { title: "Visitas" };

type Params = Promise<{ [clave: string]: string | string[] | undefined }>;

/**
 * Una ruta, dos pantallas.
 *
 * `/visitas` le muestra al coordinador la tabla de todo lo agendado, con
 * filtros y asignación en lote; y al técnico sus propias visitas en tarjetas,
 * agrupadas por urgencia y pensadas para el pulgar. Son necesidades distintas
 * sobre los mismos datos, no la misma pantalla con menos columnas.
 *
 * Comparten URL para que el enlace de la navegación sea uno solo y para que
 * `/visitas/[id]` cuelgue del mismo lugar para todos.
 */
export default async function PaginaVisitas({
  searchParams,
}: {
  searchParams: Params;
}) {
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
  const pagina = leerPagina(params.pagina);

  const [{ filas, total, paginas }, clientes, tecnicos] = await Promise.all([
    listarVisitas(filtros, pagina),
    clientesActivos(),
    tecnicosActivos(),
  ]);

  const filtrando = Object.values(filtros).some(Boolean);
  // Igual que en los maestros: "no hay ninguna" y "ninguna coincide" llevan a
  // acciones opuestas. La consulta extra corre solo si ya salió vacío.
  const vacioPorFiltro = filas.length === 0 && (filtrando || (await hayAlgunaVisita()));

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado
        titulo="Visitas"
        descripcion="Todo lo agendado. Las filas marcadas al costado todavía no tienen técnico."
        acciones={<EnlaceBoton href="/visitas/nueva">Nueva visita</EnlaceBoton>}
      />

      <BarraFiltrosVisitas
        filtros={filtros}
        clientes={clientes}
        tecnicos={tecnicos}
      />

      {filas.length === 0 ? (
        vacioPorFiltro ? (
          <EstadoVacio
            titulo="Ninguna visita coincide con estos filtros"
            descripcion="Probá con un rango de fechas más ancho, o sacá el filtro de técnico o de estado."
            accion={{ href: "/visitas", etiqueta: "Limpiar los filtros" }}
          />
        ) : (
          <EstadoVacio
            titulo="Todavía no hay visitas agendadas"
            descripcion="Agendá la primera y después asignale técnico. También podés dejarla sin asignar y repartir todo junto."
            accion={{ href: "/visitas/nueva", etiqueta: "Agendar la primera visita" }}
          />
        )
      ) : (
        <>
          <TablaVisitas visitas={filas} tecnicos={tecnicos} />

          <Paginacion
            base="/visitas"
            filtros={{
              q: filtros.busqueda,
              desde: filtros.desde,
              hasta: filtros.hasta,
              estado: filtros.estado,
              tecnico: filtros.tecnico,
              cliente: filtros.cliente,
            }}
            pagina={pagina}
            paginas={paginas}
            total={total}
            unidad={{ singular: "visita", plural: "visitas" }}
          />
        </>
      )}
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
  const visitas = await visitasAbiertasDeTecnico(sesion.tecnicoId);

  return (
    // El espacio de abajo es para el botón fijo: sin él, la última tarjeta
    // queda tapada justo cuando el técnico llega al final de la lista.
    <div className="mx-auto max-w-2xl pb-20">
      <Encabezado
        titulo="Mis visitas"
        descripcion="Lo que tenés abierto. Tocá una para registrar lo que hiciste."
      />

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
      )}

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
