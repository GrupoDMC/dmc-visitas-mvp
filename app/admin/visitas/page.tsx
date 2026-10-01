import VisitasTable from "@/components/admin/VisitasTable";
import { getVisitasCompletas, getVisitasEliminadas } from "@/lib/data/visitas";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function VisitasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; fecha?: string; tecnico?: string; tipo?: string }>;
}) {
  const sesion = await sesionCon("visitas.ver");
  if (!sesion) return <SinAcceso />;
  // Las eliminadas solo se le mandan al administrador: a los demás roles ni
  // siquiera les llegan al navegador.
  const [{ estado, fecha, tecnico, tipo }, visitas, eliminadas] = await Promise.all([
    searchParams,
    getVisitasCompletas(),
    sesion.usuario.rol === "ADMIN" ? getVisitasEliminadas() : undefined,
  ]);
  return (
    <VisitasTable
      kicker="Operación"
      title="Visitas"
      visitas={visitas}
      eliminadas={eliminadas}
      estadoInicial={estado}
      fechaInicial={fecha}
      tecnicoInicial={tecnico}
      tipoInicial={tipo}
    />
  );
}
