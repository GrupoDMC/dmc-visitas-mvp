import { redirect } from "next/navigation";
import VisitasTable from "@/components/admin/VisitasTable";
import { buscarVisitas, contarVisitasEliminadas, lugaresConVisitas } from "@/lib/data/visitas-lista";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";
import { acotarFiltros, ELIMINADAS, leerFiltrosVisitas, urlFiltrosVisitas } from "@/lib/ui/filtros-visitas";

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
  const pedidos = leerFiltrosVisitas(await searchParams, { verEliminadas: esAdmin });
  const [lugares, eliminadas] = await Promise.all([
    lugaresConVisitas(pedidos.estados.includes(ELIMINADAS)),
    esAdmin ? contarVisitasEliminadas() : undefined,
  ]);
  // Lo elegido abajo en la cadena que ya no cabe en lo de arriba se descarta, y
  // la URL lo refleja.
  const { opciones, filtros } = acotarFiltros(lugares, pedidos);
  if (urlFiltrosVisitas(filtros) !== urlFiltrosVisitas(pedidos)) redirect(urlFiltrosVisitas(filtros));
  const pagina = await buscarVisitas(filtros);
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
