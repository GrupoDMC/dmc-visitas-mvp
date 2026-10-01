import TecnicosTable from "@/components/admin/maestros/TecnicosTable";
import { listarTecnicos } from "@/lib/data/maestros";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TecnicosPage() {
  if (!(await sesionCon("tecnicos.ver"))) return <SinAcceso />;
  return <TecnicosTable tecnicos={await listarTecnicos()} />;
}
