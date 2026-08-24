import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitasPorTecnico } from "@/lib/data/visitas";
import { hoyISO } from "@/lib/ui/fecha";
import MobileShell from "@/components/mobile/MobileShell";
import VisitasList from "@/components/mobile/VisitasList";

export const dynamic = "force-dynamic";

export default async function VisitasTecnicoPage() {
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const visitas = await getVisitasPorTecnico(sesion.tecnico.id);

  return (
    <MobileShell titulo="Mis visitas">
      <VisitasList visitas={visitas} hoy={hoyISO()} />
    </MobileShell>
  );
}
