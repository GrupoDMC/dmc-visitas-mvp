import { notFound, redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitaCompletaPorFolio } from "@/lib/mock/visitas";
import { catalogoMotivo, catalogoTrabajo, catalogoProblema } from "@/lib/mock/catalogos";
import MobileShell from "@/components/mobile/MobileShell";
import FormularioVisita from "@/components/mobile/FormularioVisita";

export default async function FormularioPage({ params }: { params: Promise<{ folio: string }> }) {
  const { folio: folioParam } = await params;
  const folio = decodeURIComponent(folioParam);
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const visita = getVisitaCompletaPorFolio(folio);
  if (!visita || visita.tecnicoId !== sesion.tecnico.id) notFound();
  if (visita.estado !== "PROGRAMADA" && visita.estado !== "EN_CURSO") {
    redirect(`/tecnico/visitas/${visita.folio}`);
  }

  return (
    <MobileShell titulo="Formulario" volverHref={`/tecnico/visitas/${visita.folio}`}>
      <FormularioVisita visita={visita} motivos={catalogoMotivo} catalogoTrabajo={catalogoTrabajo} catalogoProblema={catalogoProblema} />
    </MobileShell>
  );
}
