import { notFound, redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import { listarProblemas, listarTrabajos } from "@/lib/data/catalogos";
import MobileShell from "@/components/mobile/MobileShell";
import ActaGuardada from "@/components/mobile/ActaGuardada";

export const dynamic = "force-dynamic";

export default async function RevisarActaPage({ params }: { params: Promise<{ folio: string }> }) {
  const { folio: folioParam } = await params;
  const folio = decodeURIComponent(folioParam);
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const visita = await getVisitaCompletaPorFolio(folio);
  if (!visita || visita.tecnicoId !== sesion.tecnico.id) notFound();

  const [catalogoTrabajos, catalogoProblemas] = await Promise.all([listarTrabajos(), listarProblemas()]);

  return (
    <MobileShell titulo="Acta guardada" volverHref={`/tecnico/visitas/${visita.folio}`}>
      <ActaGuardada visita={visita} catalogoTrabajos={catalogoTrabajos} catalogoProblemas={catalogoProblemas} />
    </MobileShell>
  );
}
