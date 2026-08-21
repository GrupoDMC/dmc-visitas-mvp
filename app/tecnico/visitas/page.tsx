import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitasPorTecnico } from "@/lib/mock/visitas";
import { HOY } from "@/lib/mock/queries";
import MobileShell from "@/components/mobile/MobileShell";
import VisitasList from "@/components/mobile/VisitasList";

export default async function VisitasTecnicoPage() {
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const visitas = getVisitasPorTecnico(sesion.tecnico.id);

  return (
    <MobileShell titulo="Mis visitas">
      <VisitasList visitas={visitas} hoy={HOY} />
    </MobileShell>
  );
}
