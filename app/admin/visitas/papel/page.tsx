import VisitasPapel from "@/components/admin/VisitasPapel";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** "Visitas en papel": cargar los informes hechos a mano en años anteriores. */
export default async function VisitasPapelPage() {
  if (!(await sesionCon("visitas.crear"))) return <SinAcceso />;
  return <VisitasPapel />;
}
