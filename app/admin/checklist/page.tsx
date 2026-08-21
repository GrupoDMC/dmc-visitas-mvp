import ChecklistEditor from "@/components/admin/ChecklistEditor";
import { catalogoMotivo, catalogoProblema, catalogoTrabajo } from "@/lib/mock/catalogos";

export default function ChecklistPage() {
  return <ChecklistEditor motivosIniciales={catalogoMotivo} tiposIniciales={catalogoProblema} trabajosIniciales={catalogoTrabajo} />;
}
