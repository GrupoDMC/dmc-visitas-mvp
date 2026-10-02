import PendientesView from "@/components/admin/PendientesView";
import { getPendientes } from "@/lib/data/pendientes";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ReagendasPage() {
  if (!(await sesionCon("reagendas.ver"))) return <SinAcceso />;
  return <PendientesView datos={await getPendientes()} />;
}
