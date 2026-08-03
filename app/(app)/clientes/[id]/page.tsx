import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requerirVerTodas } from "@/lib/auth";
import { formatearRut } from "@/lib/rut";
import { cambiarActivoClienteAccion } from "@/lib/acciones/clientes";
import { obtenerCliente } from "@/lib/db/clientes";
import { listarSucursalesDeCliente } from "@/lib/db/sucursales";
import { contarVisitasAbiertasDeCliente } from "@/lib/db/visitas";
import { BadgeActivo } from "@/components/ui/badge-activo";
import { Encabezado, EnlaceBoton } from "@/components/ui/encabezado";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Fila, SinDato, Tabla, Td, Th } from "@/components/ui/tabla";
import {
  BotonReactivar,
  DialogoDesactivar,
} from "@/components/ui/dialogo-desactivar";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const cliente = await leer(id);
  return { title: cliente ? cliente.razon_social : "Cliente" };
}

/** Un id que no es número no es "no encontrado por ahora": no existe. */
async function leer(id: string) {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero < 1) return null;
  return obtenerCliente(numero);
}

function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-suave">{etiqueta}</dt>
      <dd className="min-w-0 text-right text-sm text-texto">{children}</dd>
    </div>
  );
}

export default async function PaginaCliente({ params }: Props) {
  await requerirVerTodas();

  const { id } = await params;
  const cliente = await leer(id);
  if (!cliente) notFound();

  const [sucursales, visitasAbiertas] = await Promise.all([
    listarSucursalesDeCliente(cliente.id),
    contarVisitasAbiertasDeCliente(cliente.id),
  ]);

  const activas = sucursales.filter((s) => s.activo).length;

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado
        titulo={cliente.razon_social}
        descripcion={cliente.nombre_fantasia ?? undefined}
        volverA={{ href: "/clientes", etiqueta: "Clientes" }}
        acciones={
          <>
            <EnlaceBoton href={`/clientes/${cliente.id}/editar`} variante="secundario">
              Editar datos
            </EnlaceBoton>
            {cliente.activo ? (
              <DialogoDesactivar
                accion={cambiarActivoClienteAccion}
                id={cliente.id}
                titulo="¿Desactivar este cliente?"
                nombre={cliente.razon_social}
                visitasAbiertas={visitasAbiertas}
              />
            ) : (
              <BotonReactivar accion={cambiarActivoClienteAccion} id={cliente.id} />
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <section aria-labelledby="datos-cliente">
          <h2
            id="datos-cliente"
            className="mb-2 text-sm font-medium text-texto"
          >
            Datos del cliente
          </h2>
          <div className="rounded-card border border-borde bg-superficie shadow-tarjeta">
            <dl className="divide-y divide-borde">
              <Dato etiqueta="RUT">
                <span className="tabular-nums">{formatearRut(cliente.rut)}</span>
              </Dato>
              <Dato etiqueta="Razón social">{cliente.razon_social}</Dato>
              <Dato etiqueta="Nombre de fantasía">
                {cliente.nombre_fantasia ?? <SinDato />}
              </Dato>
              <Dato etiqueta="Teléfono">
                {cliente.telefono ? (
                  <a
                    href={`tel:${cliente.telefono}`}
                    className="text-acento hover:underline"
                  >
                    {cliente.telefono}
                  </a>
                ) : (
                  <SinDato />
                )}
              </Dato>
              <Dato etiqueta="Correo">
                {cliente.email ? (
                  <a
                    href={`mailto:${cliente.email}`}
                    className="break-all text-acento hover:underline"
                  >
                    {cliente.email}
                  </a>
                ) : (
                  <SinDato />
                )}
              </Dato>
              <Dato etiqueta="Estado">
                <BadgeActivo activo={cliente.activo} />
              </Dato>
            </dl>
          </div>
        </section>

        <section aria-labelledby="sucursales-cliente">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2
              id="sucursales-cliente"
              className="text-sm font-medium text-texto"
            >
              Sucursales
              {sucursales.length > 0 ? (
                <span className="ml-1.5 font-normal text-suave">
                  ({activas} {activas === 1 ? "activa" : "activas"} de{" "}
                  {sucursales.length})
                </span>
              ) : null}
            </h2>
            {sucursales.length > 0 ? (
              <EnlaceBoton
                href={`/clientes/${cliente.id}/sucursales/nueva`}
                variante="secundario"
              >
                Agregar sucursal
              </EnlaceBoton>
            ) : null}
          </div>

          {sucursales.length === 0 ? (
            <EstadoVacio
              titulo="Este cliente todavía no tiene sucursales"
              descripcion="Una visita siempre se hace en una sucursal, así que hace falta al menos una para poder agendarle trabajo."
              accion={{
                href: `/clientes/${cliente.id}/sucursales/nueva`,
                etiqueta: "Agregar la primera sucursal",
              }}
            />
          ) : (
            <Tabla
              cabecera={
                <>
                  <Th>Sucursal</Th>
                  <Th soloAncha>Dirección</Th>
                  <Th soloAncha>Comuna</Th>
                  <Th>Estado</Th>
                </>
              }
            >
              {sucursales.map((sucursal) => (
                <Fila key={sucursal.id}>
                  <Td>
                    <Link
                      href={`/clientes/${cliente.id}/sucursales/${sucursal.id}`}
                      className="font-medium text-acento hover:underline"
                    >
                      {sucursal.nombre}
                    </Link>
                    {sucursal.codigo_interno ? (
                      <span className="block text-xs tabular-nums text-suave">
                        {sucursal.codigo_interno}
                      </span>
                    ) : null}
                  </Td>
                  <Td soloAncha>{sucursal.direccion ?? <SinDato />}</Td>
                  <Td soloAncha>{sucursal.comuna ?? <SinDato />}</Td>
                  <Td>
                    <BadgeActivo activo={sucursal.activo} />
                  </Td>
                </Fila>
              ))}
            </Tabla>
          )}
        </section>
      </div>
    </div>
  );
}
