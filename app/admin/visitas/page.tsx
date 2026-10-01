import VisitasTable from "@/components/admin/VisitasTable";
import { getVisitasCompletas } from "@/lib/data/visitas";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function VisitasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; fecha?: string; tecnico?: string; tipo?: string }>;
}) {
  if (!(await sesionCon("visitas.ver"))) return <SinAcceso />;
  const [{ estado, fecha, tecnico, tipo }, visitas] = await Promise.all([searchParams, getVisitasCompletas()]);
  return (
    <VisitasTable
      kicker="Operación"
      title="Visitas"
      visitas={visitas}
      estadoInicial={estado}
      fechaInicial={fecha}
      tecnicoInicial={tecnico}
      tipoInicial={tipo}
    />
  );
}
