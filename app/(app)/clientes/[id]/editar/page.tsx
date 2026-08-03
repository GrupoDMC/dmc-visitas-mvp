import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requerirVerTodas } from "@/lib/auth";
import { actualizarClienteAccion } from "@/lib/acciones/clientes";
import { obtenerCliente } from "@/lib/db/clientes";
import { contarVisitasAbiertasDeCliente } from "@/lib/db/visitas";
import { Encabezado } from "@/components/ui/encabezado";
import { FormularioCliente } from "@/components/maestros/formulario-cliente";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function PaginaEditarCliente({
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

  // Se carga acá y no dentro del formulario: el aviso de "tiene N visitas
  // abiertas" tiene que estar listo en el momento en que se desmarca la
  // casilla, sin ir a buscar nada.
  const visitasAbiertas = await contarVisitasAbiertasDeCliente(cliente.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Editar cliente"
        descripcion={cliente.razon_social}
        volverA={{ href: `/clientes/${cliente.id}`, etiqueta: "Ficha del cliente" }}
      />

      <FormularioCliente
        accion={actualizarClienteAccion}
        cliente={cliente}
        visitasAbiertas={visitasAbiertas}
      />
    </div>
  );
}
