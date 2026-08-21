import { notFound, redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitaCompletaPorFolio } from "@/lib/mock/visitas";
import { getHistorialLocal } from "@/lib/mock/historial";
import MobileShell from "@/components/mobile/MobileShell";
import DetalleVisita from "@/components/mobile/DetalleVisita";

export default async function DetalleVisitaPage({ params }: { params: Promise<{ folio: string }> }) {
  const { folio: folioParam } = await params;
  const folio = decodeURIComponent(folioParam);
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const visita = getVisitaCompletaPorFolio(folio);
  if (!visita || visita.tecnicoId !== sesion.tecnico.id) notFound();

  return (
    <MobileShell titulo="Visita" volverHref="/tecnico/visitas">
      <DetalleVisita visita={visita} historial={getHistorialLocal(visita.sucursal?.nombre)} />
    </MobileShell>
  );
}
