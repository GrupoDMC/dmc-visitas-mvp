import VisitasTable from "@/components/admin/VisitasTable";
import { getVisitasCompletas } from "@/lib/data/visitas";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ReagendasPage() {
  if (!(await sesionCon("reagendas.ver"))) return <SinAcceso />;
  const todas = await getVisitasCompletas();
  const visitas = todas.filter((v) => v.estado === "REAGENDADA" || v.estado === "PENDIENTE");
  return (
    <VisitasTable
      kicker="Operación · visitas que no se pudieron hacer"
      title="Reagendas y pendientes"
      visitas={visitas}
      conMotivoTecnico
      permiteCrear={false}
    />
  );
}
