import ProblemasView from "@/components/admin/ProblemasView";
import { getProblemasPorSucursal } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

export default async function ProblemasPage() {
  return <ProblemasView grupos={await getProblemasPorSucursal()} />;
}
