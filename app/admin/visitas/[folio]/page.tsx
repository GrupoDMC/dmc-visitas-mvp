import { notFound } from "next/navigation";
import { getVisitaCompletaPorFolio, getActaEnviada } from "@/lib/mock/visitas";
import ActaView from "@/components/admin/ActaView";

export default async function ActaPage({ params }: { params: Promise<{ folio: string }> }) {
  const { folio } = await params;
  const visita = getVisitaCompletaPorFolio(decodeURIComponent(folio));
  if (!visita) notFound();

  return <ActaView visita={visita} enviada={getActaEnviada(visita.folio)} />;
}
