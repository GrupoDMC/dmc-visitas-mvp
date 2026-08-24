import { notFound, redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import { getHistorialLocal } from "@/lib/data/historial";
import MobileShell from "@/components/mobile/MobileShell";
import DetalleVisita from "@/components/mobile/DetalleVisita";

export const dynamic = "force-dynamic";

export default async function DetalleVisitaPage({ params }: { params: Promise<{ folio: string }> }) {
  const { folio: folioParam } = await params;
  const folio = decodeURIComponent(folioParam);
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const visita = await getVisitaCompletaPorFolio(folio);
  if (!visita || visita.tecnicoId !== sesion.tecnico.id) notFound();

  const historial = await getHistorialLocal(visita.sucursalId, visita.id);

  return (
    <MobileShell titulo="Visita" volverHref="/tecnico/visitas">
      <DetalleVisita visita={visita} historial={historial} />
    </MobileShell>
  );
}
