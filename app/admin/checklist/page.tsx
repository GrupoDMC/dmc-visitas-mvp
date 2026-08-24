import ChecklistEditor from "@/components/admin/ChecklistEditor";
import { getPlantilla, listarMotivos, listarProblemas, listarTrabajos, PLANTILLA_PROPIA } from "@/lib/data/catalogos";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const [motivos, tipos, trabajos, plantilla] = await Promise.all([
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
    getPlantilla(PLANTILLA_PROPIA),
  ]);

  return (
    <ChecklistEditor
      motivosIniciales={motivos}
      tiposIniciales={tipos}
      trabajosIniciales={trabajos}
      plantillaInicial={plantilla}
    />
  );
}
