import { notFound } from "next/navigation";
import { getActaEnviada, getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import ActaView from "@/components/admin/ActaView";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ActaPage({ params }: { params: Promise<{ folio: string }> }) {
  if (!(await sesionCon("visitas.ver"))) return <SinAcceso />;
  const { folio } = await params;
  const visita = await getVisitaCompletaPorFolio(decodeURIComponent(folio));
  if (!visita) notFound();

  return <ActaView visita={visita} enviada={await getActaEnviada(visita.folio)} />;
}
