import { notFound } from "next/navigation";
import { getActaEnviada, getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import ActaView from "@/components/admin/ActaView";

export const dynamic = "force-dynamic";

export default async function ActaPage({ params }: { params: Promise<{ folio: string }> }) {
  const { folio } = await params;
  const visita = await getVisitaCompletaPorFolio(decodeURIComponent(folio));
  if (!visita) notFound();

  return <ActaView visita={visita} enviada={await getActaEnviada(visita.folio)} />;
}
