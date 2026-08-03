import Link from "next/link";
import type { Metadata } from "next";
import { requerirVerTodas } from "@/lib/auth";
import { leerPagina, unico } from "@/lib/paginacion";
import { formatearRut } from "@/lib/rut";
import { leerFiltroActivo } from "@/lib/db/filtros";
import { hayAlgunTecnico, listarTecnicos } from "@/lib/db/tecnicos";
import { BadgeActivo } from "@/components/ui/badge-activo";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { Encabezado, EnlaceBoton } from "@/components/ui/encabezado";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Paginacion } from "@/components/ui/paginacion";
import { Fila, SinDato, Tabla, Td, Th } from "@/components/ui/tabla";

export const metadata: Metadata = { title: "Técnicos" };

type Params = Promise<{ [clave: string]: string | string[] | undefined }>;

export default async function PaginaTecnicos({
  searchParams,
}: {
  searchParams: Params;
}) {
  await requerirVerTodas();

  const params = await searchParams;
  const busqueda = unico(params.q);
  const estado = unico(params.estado);
  const pagina = leerPagina(params.pagina);

  const { filas, total, paginas } = await listarTecnicos({
    busqueda,
    activo: leerFiltroActivo(estado),
    pagina,
  });

  // Tres estados vacíos distintos, tres acciones distintas. Ver el mismo
  // comentario en el listado de clientes.
  const filtrando = Boolean(busqueda) || (estado !== "" && estado !== "activos");
  const soloInactivos =
    filas.length === 0 && !filtrando && (await hayAlgunTecnico());

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado
        titulo="Técnicos"
        descripcion="Quiénes salen a terreno. Solo los activos aparecen para asignar visitas."
        acciones={<EnlaceBoton href="/tecnicos/nuevo">Nuevo técnico</EnlaceBoton>}
      />

      <BarraFiltros
        base="/tecnicos"
        busqueda={busqueda}
        estado={estado}
        etiquetaBusqueda="Buscar técnico"
        ayudaBusqueda="Nombre, apellido o RUT"
      />

      {filas.length === 0 ? (
        filtrando ? (
          <EstadoVacio
            titulo="Ningún técnico coincide con esa búsqueda"
            descripcion="Probá con parte del apellido, o revisá el filtro de activos e inactivos."
            accion={{ href: "/tecnicos", etiqueta: "Limpiar la búsqueda" }}
          />
        ) : soloInactivos ? (
          <EstadoVacio
            titulo="No hay técnicos activos"
            descripcion="Los que están cargados fueron desactivados. Podés verlos y reactivar el que necesites."
            accion={{ href: "/tecnicos?estado=inactivos", etiqueta: "Ver los inactivos" }}
          />
        ) : (
          <EstadoVacio
            titulo="Todavía no hay técnicos cargados"
            descripcion="Sin técnicos no se pueden asignar visitas. Cargá el primero para empezar a repartir trabajo."
            accion={{ href: "/tecnicos/nuevo", etiqueta: "Crear el primer técnico" }}
          />
        )
      ) : (
        <>
          <Tabla
            cabecera={
              <>
                <Th>Técnico</Th>
                <Th numerica>RUT</Th>
                <Th soloAncha>Teléfono</Th>
                <Th soloAncha>Correo</Th>
                <Th>Estado</Th>
              </>
            }
          >
            {filas.map((tecnico) => (
              <Fila key={tecnico.id}>
                <Td>
                  <Link
                    href={`/tecnicos/${tecnico.id}`}
                    className="font-medium text-acento hover:underline"
                  >
                    {tecnico.apellidos}, {tecnico.nombres}
                  </Link>
                </Td>
                <Td numerica>{formatearRut(tecnico.rut)}</Td>
                <Td soloAncha>
                  {tecnico.telefono ? (
                    <a
                      href={`tel:${tecnico.telefono}`}
                      className="text-acento hover:underline"
                    >
                      {tecnico.telefono}
                    </a>
                  ) : (
                    <SinDato />
                  )}
                </Td>
                <Td soloAncha className="max-w-[16rem] truncate">
                  {tecnico.email ?? <SinDato />}
                </Td>
                <Td>
                  <BadgeActivo activo={tecnico.activo} />
                </Td>
              </Fila>
            ))}
          </Tabla>

          <Paginacion
            base="/tecnicos"
            filtros={{ q: busqueda, estado }}
            pagina={pagina}
            paginas={paginas}
            total={total}
            unidad={{ singular: "técnico", plural: "técnicos" }}
          />
        </>
      )}
    </div>
  );
}
