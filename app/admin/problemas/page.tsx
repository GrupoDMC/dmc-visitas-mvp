import ProblemasView from "@/components/admin/ProblemasView";
import { getProblemasPorSucursal } from "@/lib/data/queries";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProblemasPage() {
  if (!(await sesionCon("problemas.ver"))) return <SinAcceso />;
  return <ProblemasView grupos={await getProblemasPorSucursal()} />;
}
