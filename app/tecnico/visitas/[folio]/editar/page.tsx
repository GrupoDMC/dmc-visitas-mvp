import { notFound, redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import { listarInternos, listarMotivos, listarProblemas, listarTrabajos } from "@/lib/data/catalogos";
import MobileShell from "@/components/mobile/MobileShell";
import FormularioVisita from "@/components/mobile/FormularioVisita";
import { participaEnVisita } from "@/lib/ui/estado";
import { tiene } from "@/lib/permisos";

export const dynamic = "force-dynamic";

/** Corregir un acta ya cerrada, desde el celular y dentro del plazo. */
export default async function EditarActaPage({ params }: { params: Promise<{ folio: string }> }) {
  const { folio: folioParam } = await params;
  const folio = decodeURIComponent(folioParam);
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const visita = await getVisitaCompletaPorFolio(folio);
  if (!visita || !participaEnVisita(visita, sesion.tecnico.id)) notFound();
  // Fuera de plazo o sin acta cerrada no hay nada que editar: vuelve al acta,
  // que es donde se explica por qué.
  if (
    visita.estado !== "COMPLETADA" ||
    !visita.ejecucion?.editablePorTecnico ||
    !tiene(sesion.permisos, "celular.editarActa")
  ) {
    redirect(`/tecnico/visitas/${visita.folio}/revisar`);
  }

  const [motivos, trabajos, problemas, internos] = await Promise.all([
    listarMotivos(),
    listarTrabajos(),
    listarProblemas(),
    listarInternos(),
  ]);

  return (
    <MobileShell titulo="Editar acta" volverHref={`/tecnico/visitas/${visita.folio}/revisar`}>
      <FormularioVisita
        visita={visita}
        motivos={motivos}
        catalogoTrabajo={trabajos}
        catalogoProblema={problemas}
        catalogoInterno={internos}
        edicion
      />
    </MobileShell>
  );
}
