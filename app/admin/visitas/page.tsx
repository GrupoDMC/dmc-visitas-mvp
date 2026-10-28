import VisitasTable from "@/components/admin/VisitasTable";
import { buscarVisitas, contarVisitasEliminadas, opcionesFiltroVisitas } from "@/lib/data/visitas-lista";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";
import { leerFiltrosVisitas } from "@/lib/ui/filtros-visitas";

export const dynamic = "force-dynamic";

export default async function VisitasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await sesionCon("visitas.ver");
  if (!sesion) return <SinAcceso />;
  // Las eliminadas solo se le muestran al administrador: a los demás roles ni
  // siquiera se les ofrece la opción, y la URL no las abre.
  const esAdmin = sesion.usuario.rol === "ADMIN";
  const filtros = leerFiltrosVisitas(await searchParams, { verEliminadas: esAdmin });
  const [pagina, opciones, eliminadas] = await Promise.all([
    buscarVisitas(filtros),
    opcionesFiltroVisitas(filtros.clienteIds),
    esAdmin ? contarVisitasEliminadas() : undefined,
  ]);
  return (
    <VisitasTable
      kicker="Operación"
      title="Visitas"
      filtros={{ ...filtros, pagina: pagina.pagina }}
      pagina={pagina}
      opciones={opciones}
      eliminadas={eliminadas}
    />
  );
}
