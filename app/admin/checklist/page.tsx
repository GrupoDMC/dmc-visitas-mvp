import ChecklistEditor from "@/components/admin/ChecklistEditor";
import {
  getPlantilla,
  listarCargos,
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
    cargos,
    gestionProblemas,
    estadosProblema,
    seccionesMotivo,
    seccionesTrabajo,
    plantilla,
  ] = await Promise.all([
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
    listarInternos(),
    listarPendientes(),
    listarCargos(),
    listarGestionProblemas(),
    listarEstadosProblema(),
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
      cargosIniciales={cargos}
      gestionProblemasIniciales={gestionProblemas}
      estadosProblemaIniciales={estadosProblema.filter((e) => e.activo)}
      seccionesMotivoIniciales={seccionesMotivo}
      seccionesTrabajoIniciales={seccionesTrabajo}
      plantillaInicial={plantilla}
    />
  );
}
