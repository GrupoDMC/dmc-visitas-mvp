import VisitasTable from "@/components/admin/VisitasTable";
import { getVisitasCompletas } from "@/lib/mock/visitas";

export default function ReagendasPage() {
  const visitas = getVisitasCompletas().filter((v) => v.estado === "REAGENDADA" || v.estado === "PENDIENTE");
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
