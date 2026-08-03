import Link from "next/link";
import type { Metadata } from "next";
import { requerirVerTodas } from "@/lib/auth";
import { leerPagina, unico } from "@/lib/paginacion";
import { formatearRut } from "@/lib/rut";
import { leerFiltroActivo } from "@/lib/db/filtros";
import { hayAlgunCliente, listarClientes } from "@/lib/db/clientes";
import { BadgeActivo } from "@/components/ui/badge-activo";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { Encabezado, EnlaceBoton } from "@/components/ui/encabezado";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Paginacion } from "@/components/ui/paginacion";
import { Fila, SinDato, Tabla, Td, Th } from "@/components/ui/tabla";

export const metadata: Metadata = { title: "Clientes" };

type Params = Promise<{ [clave: string]: string | string[] | undefined }>;

export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Params;
}) {
  await requerirVerTodas();

  const params = await searchParams;
  const busqueda = unico(params.q);
  const estado = unico(params.estado);
  const pagina = leerPagina(params.pagina);

  const { filas, total, paginas } = await listarClientes({
    busqueda,
    activo: leerFiltroActivo(estado),
    pagina,
  });

  // Un listado vacío tiene tres causas distintas y cada una lleva a una acción
  // distinta: limpiar el buscador, cambiar el filtro, o crear el primer
  // cliente. La consulta extra corre solo cuando ya sabemos que está vacío.
  const filtrando = Boolean(busqueda) || (estado !== "" && estado !== "activos");
  const soloInactivos =
    filas.length === 0 && !filtrando && (await hayAlgunCliente());

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado
        titulo="Clientes"
        descripcion="Las empresas a las que se les hacen visitas, con sus sucursales."
        acciones={<EnlaceBoton href="/clientes/nuevo">Nuevo cliente</EnlaceBoton>}
      />

      <BarraFiltros
        base="/clientes"
        busqueda={busqueda}
        estado={estado}
        etiquetaBusqueda="Buscar cliente"
        ayudaBusqueda="Razón social o RUT"
      />

      {filas.length === 0 ? (
        filtrando ? (
          <EstadoVacio
            titulo="Ningún cliente coincide con esa búsqueda"
            descripcion="Probá con parte de la razón social, o revisá el filtro de activos e inactivos."
            accion={{ href: "/clientes", etiqueta: "Limpiar la búsqueda" }}
          />
        ) : soloInactivos ? (
          <EstadoVacio
            titulo="No hay clientes activos"
            descripcion="Los que están cargados fueron desactivados. Podés verlos y reactivar el que necesites."
            accion={{ href: "/clientes?estado=inactivos", etiqueta: "Ver los inactivos" }}
          />
        ) : (
          <EstadoVacio
            titulo="Todavía no hay clientes cargados"
            descripcion="Cargá el primero para poder agendarle visitas. Después le agregás las sucursales desde su ficha."
            accion={{ href: "/clientes/nuevo", etiqueta: "Crear el primer cliente" }}
          />
        )
      ) : (
        <>
          <Tabla
            cabecera={
              <>
                <Th>Razón social</Th>
                <Th numerica>RUT</Th>
                <Th soloAncha>Teléfono</Th>
                <Th soloAncha>Correo</Th>
                <Th>Estado</Th>
              </>
            }
          >
            {filas.map((cliente) => (
              <Fila key={cliente.id}>
                <Td>
                  <Link
                    href={`/clientes/${cliente.id}`}
                    className="font-medium text-acento hover:underline"
                  >
                    {cliente.razon_social}
                  </Link>
                  {cliente.nombre_fantasia ? (
                    <span className="block text-xs text-suave">
                      {cliente.nombre_fantasia}
                    </span>
                  ) : null}
                </Td>
                <Td numerica>{formatearRut(cliente.rut)}</Td>
                <Td soloAncha>{cliente.telefono ?? <SinDato />}</Td>
                <Td soloAncha className="max-w-[16rem] truncate">
                  {cliente.email ?? <SinDato />}
                </Td>
                <Td>
                  <BadgeActivo activo={cliente.activo} />
                </Td>
              </Fila>
            ))}
          </Tabla>

          <Paginacion
            base="/clientes"
            filtros={{ q: busqueda, estado }}
            pagina={pagina}
            paginas={paginas}
            total={total}
            unidad={{ singular: "cliente", plural: "clientes" }}
          />
        </>
      )}
    </div>
  );
}
