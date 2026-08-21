import VisitasTable from "@/components/admin/VisitasTable";
import { getVisitasCompletas } from "@/lib/mock/visitas";

export default async function VisitasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; fecha?: string; tecnico?: string; tipo?: string }>;
}) {
  const { estado, fecha, tecnico, tipo } = await searchParams;
  return (
    <VisitasTable
      kicker="Operación"
      title="Visitas"
      visitas={getVisitasCompletas()}
      estadoInicial={estado}
      fechaInicial={fecha}
      tecnicoInicial={tecnico}
      tipoInicial={tipo}
    />
  );
}
