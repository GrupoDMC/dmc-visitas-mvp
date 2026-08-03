import type { Metadata } from "next";
import { requerirVerTodas } from "@/lib/auth";
import { crearTecnicoAccion } from "@/lib/acciones/tecnicos";
import { Encabezado } from "@/components/ui/encabezado";
import { FormularioTecnico } from "@/components/maestros/formulario-tecnico";

export const metadata: Metadata = { title: "Nuevo técnico" };

export default async function PaginaNuevoTecnico() {
  await requerirVerTodas();

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Nuevo técnico"
        descripcion="Esta es la ficha del técnico. El usuario con el que entra a la app se crea aparte, en la última fase."
        volverA={{ href: "/tecnicos", etiqueta: "Técnicos" }}
      />

      <FormularioTecnico accion={crearTecnicoAccion} />
    </div>
  );
}
