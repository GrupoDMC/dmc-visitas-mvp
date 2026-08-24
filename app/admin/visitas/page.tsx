import VisitasTable from "@/components/admin/VisitasTable";
import { getVisitasCompletas } from "@/lib/data/visitas";

export const dynamic = "force-dynamic";

export default async function VisitasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; fecha?: string; tecnico?: string; tipo?: string }>;
}) {
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
