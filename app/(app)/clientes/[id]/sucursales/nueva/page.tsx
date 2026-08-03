import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requerirVerTodas } from "@/lib/auth";
import { crearSucursalAccion } from "@/lib/acciones/sucursales";
import { obtenerCliente } from "@/lib/db/clientes";
import { Encabezado } from "@/components/ui/encabezado";
import { FormularioSucursal } from "@/components/maestros/formulario-sucursal";

export const metadata: Metadata = { title: "Nueva sucursal" };

export default async function PaginaNuevaSucursal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirVerTodas();

  const { id } = await params;
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero < 1) notFound();

  const cliente = await obtenerCliente(numero);
  if (!cliente) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Nueva sucursal"
        descripcion={`Se agrega a ${cliente.razon_social}.`}
        volverA={{
          href: `/clientes/${cliente.id}`,
          etiqueta: cliente.razon_social,
        }}
      />

      <FormularioSucursal
        accion={crearSucursalAccion}
        clienteId={cliente.id}
        volverA={`/clientes/${cliente.id}`}
      />
    </div>
  );
}
