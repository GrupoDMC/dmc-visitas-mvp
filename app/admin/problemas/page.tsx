import ProblemasView from "@/components/admin/ProblemasView";
import { getProblemasPorSucursal } from "@/lib/mock/queries";

export default function ProblemasPage() {
  return <ProblemasView grupos={getProblemasPorSucursal()} />;
}
