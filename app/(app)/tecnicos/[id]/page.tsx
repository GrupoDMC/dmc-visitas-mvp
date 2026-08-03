import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requerirVerTodas } from "@/lib/auth";
import { cambiarActivoTecnicoAccion, actualizarTecnicoAccion } from "@/lib/acciones/tecnicos";
import { nombreTecnico, obtenerTecnico } from "@/lib/db/tecnicos";
import {
  contarVisitasAbiertasDeTecnico,
  frasearVisitasAbiertas,
} from "@/lib/db/visitas";
import { Encabezado } from "@/components/ui/encabezado";
import { FormularioTecnico } from "@/components/maestros/formulario-tecnico";
import {
  BotonReactivar,
  DialogoDesactivar,
} from "@/components/ui/dialogo-desactivar";

type Props = { params: Promise<{ id: string }> };

async function leer(id: string) {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero < 1) return null;
  return obtenerTecnico(numero);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const tecnico = await leer(id);
  return { title: tecnico ? nombreTecnico(tecnico) : "Técnico" };
}

export default async function PaginaTecnico({ params }: Props) {
  await requerirVerTodas();

  const { id } = await params;
  const tecnico = await leer(id);
  if (!tecnico) notFound();

  const visitasAbiertas = await contarVisitasAbiertasDeTecnico(tecnico.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo={nombreTecnico(tecnico)}
        descripcion={
          visitasAbiertas > 0
            ? `Tiene ${frasearVisitasAbiertas(visitasAbiertas)} asignadas.`
            : "No tiene visitas abiertas asignadas."
        }
        volverA={{ href: "/tecnicos", etiqueta: "Técnicos" }}
        acciones={
          tecnico.activo ? (
            <DialogoDesactivar
              accion={cambiarActivoTecnicoAccion}
              id={tecnico.id}
              titulo="¿Desactivar este técnico?"
              nombre={nombreTecnico(tecnico)}
              visitasAbiertas={visitasAbiertas}
            />
          ) : (
            <BotonReactivar accion={cambiarActivoTecnicoAccion} id={tecnico.id} />
          )
        }
      />

      <FormularioTecnico
        accion={actualizarTecnicoAccion}
        tecnico={tecnico}
        visitasAbiertas={visitasAbiertas}
      />
    </div>
  );
}
