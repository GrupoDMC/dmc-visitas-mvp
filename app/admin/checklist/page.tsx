import ChecklistEditor from "@/components/admin/ChecklistEditor";
import {
  getPlantilla,
  hayEstadosProblema,
  hayGestionPendientes,
  hayGestionProblemas,
  haySecciones,
  hayTrabajosPorMotivo,
  listarEstadosProblema,
  listarGestionProblemas,
  listarInternos,
  listarMotivos,
  listarPendientes,
  listarProblemas,
  listarSecciones,
  listarTrabajos,
  PLANTILLA_PROPIA,
} from "@/lib/data/catalogos";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  if (!(await sesionCon("checklist.ver"))) return <SinAcceso />;
  const [
    motivos,
    tipos,
    trabajos,
    internos,
    pendientes,
    gestionDisponible,
    gestionProblemas,
    gestionProblemasDisponible,
    estadosProblema,
    estadosProblemaDisponible,
    trabajosPorMotivoDisponible,
    seccionesDisponible,
    seccionesMotivo,
    seccionesTrabajo,
    plantilla,
  ] = await Promise.all([
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
    listarInternos(),
    listarPendientes(),
    hayGestionPendientes(),
    listarGestionProblemas(),
    hayGestionProblemas(),
    listarEstadosProblema(),
    hayEstadosProblema(),
    hayTrabajosPorMotivo(),
    haySecciones(),
    listarSecciones("MOTIVO"),
    listarSecciones("TRABAJO"),
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
      gestionProblemasIniciales={gestionProblemas}
      gestionProblemasDisponible={gestionProblemasDisponible}
      estadosProblemaIniciales={estadosProblema.filter((e) => e.activo)}
      estadosProblemaDisponible={estadosProblemaDisponible}
      trabajosPorMotivoDisponible={trabajosPorMotivoDisponible}
      seccionesDisponible={seccionesDisponible}
      seccionesMotivoIniciales={seccionesMotivo}
      seccionesTrabajoIniciales={seccionesTrabajo}
      plantillaInicial={plantilla}
    />
  );
}
