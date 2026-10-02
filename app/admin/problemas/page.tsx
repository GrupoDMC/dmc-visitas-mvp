import ProblemasView from "@/components/admin/ProblemasView";
import { getPanelProblemas } from "@/lib/data/problemas";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProblemasPage() {
  if (!(await sesionCon("problemas.ver"))) return <SinAcceso />;
  return <ProblemasView datos={await getPanelProblemas()} />;
}
