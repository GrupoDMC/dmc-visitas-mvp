import VisitasTable from "@/components/admin/VisitasTable";
import { getVisitasCompletas } from "@/lib/data/visitas";

export const dynamic = "force-dynamic";

export default async function ReagendasPage() {
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
