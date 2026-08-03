import type { Metadata } from "next";
import { requerirVerTodas } from "@/lib/auth";
import { crearClienteAccion } from "@/lib/acciones/clientes";
import { Encabezado } from "@/components/ui/encabezado";
import { FormularioCliente } from "@/components/maestros/formulario-cliente";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function PaginaNuevoCliente() {
  await requerirVerTodas();

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Nuevo cliente"
        descripcion="Después de crearlo vas a poder cargarle las sucursales desde su ficha."
        volverA={{ href: "/clientes", etiqueta: "Clientes" }}
      />

      <FormularioCliente accion={crearClienteAccion} />
    </div>
  );
}
