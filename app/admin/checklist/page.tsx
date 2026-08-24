import ChecklistEditor from "@/components/admin/ChecklistEditor";
import { listarMotivos, listarProblemas, listarTrabajos } from "@/lib/data/catalogos";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const [motivos, tipos, trabajos] = await Promise.all([listarMotivos(), listarProblemas(), listarTrabajos()]);
  return <ChecklistEditor motivosIniciales={motivos} tiposIniciales={tipos} trabajosIniciales={trabajos} />;
}
