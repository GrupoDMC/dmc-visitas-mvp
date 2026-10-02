import ChecklistEditor from "@/components/admin/ChecklistEditor";
import {
  getPlantilla,
  hayGestionPendientes,
  listarInternos,
  listarMotivos,
  listarPendientes,
  listarProblemas,
  listarTrabajos,
  PLANTILLA_PROPIA,
} from "@/lib/data/catalogos";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  if (!(await sesionCon("checklist.ver"))) return <SinAcceso />;
  const [motivos, tipos, trabajos, internos, pendientes, gestionDisponible, plantilla] = await Promise.all([
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
    listarInternos(),
    listarPendientes(),
    hayGestionPendientes(),
    getPlantilla(PLANTILLA_PROPIA),
  ]);

  return (
    <ChecklistEditor
      motivosIniciales={motivos}
      tiposIniciales={tipos}
      trabajosIniciales={trabajos}
      internosIniciales={internos}
      pendientesIniciales={pendientes}
      gestionDisponible={gestionDisponible}
      plantillaInicial={plantilla}
    />
  );
}
