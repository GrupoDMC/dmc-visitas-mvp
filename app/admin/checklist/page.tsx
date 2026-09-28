import ChecklistEditor from "@/components/admin/ChecklistEditor";
import {
  getPlantilla,
  listarInternos,
  listarMotivos,
  listarProblemas,
  listarTrabajos,
  PLANTILLA_PROPIA,
} from "@/lib/data/catalogos";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const [motivos, tipos, trabajos, internos, plantilla] = await Promise.all([
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
    listarInternos(),
    getPlantilla(PLANTILLA_PROPIA),
  ]);

  return (
    <ChecklistEditor
      motivosIniciales={motivos}
      tiposIniciales={tipos}
      trabajosIniciales={trabajos}
      internosIniciales={internos}
      plantillaInicial={plantilla}
    />
  );
}
