import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requerirVerTodas } from "@/lib/auth";
import { actualizarSucursalAccion } from "@/lib/acciones/sucursales";
import { obtenerCliente } from "@/lib/db/clientes";
import { obtenerSucursal } from "@/lib/db/sucursales";
import { Encabezado } from "@/components/ui/encabezado";
import { FormularioSucursal } from "@/components/maestros/formulario-sucursal";

export const metadata: Metadata = { title: "Editar sucursal" };

type Props = { params: Promise<{ id: string; sucursalId: string }> };

function aNumero(valor: string): number | null {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

export default async function PaginaEditarSucursal({ params }: Props) {
  await requerirVerTodas();

  const { id, sucursalId } = await params;
  const clienteId = aNumero(id);
  const numeroSucursal = aNumero(sucursalId);
  if (clienteId === null || numeroSucursal === null) notFound();

  const [cliente, sucursal] = await Promise.all([
    obtenerCliente(clienteId),
    obtenerSucursal(numeroSucursal),
  ]);

  if (!cliente || !sucursal) notFound();

  // La sucursal tiene que ser de este cliente. Si no, la URL está armada a
  // mano y mostrarla igual dejaría unas migas que mienten.
  if (sucursal.cliente_id !== cliente.id) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo={sucursal.nombre}
        descripcion={`Sucursal de ${cliente.razon_social}.`}
        volverA={{
          href: `/clientes/${cliente.id}`,
          etiqueta: cliente.razon_social,
        }}
      />

      <FormularioSucursal
        accion={actualizarSucursalAccion}
        clienteId={cliente.id}
        volverA={`/clientes/${cliente.id}`}
        sucursal={sucursal}
      />
    </div>
  );
}
