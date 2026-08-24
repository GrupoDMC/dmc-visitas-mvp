import TecnicosTable from "@/components/admin/maestros/TecnicosTable";
import { listarTecnicos } from "@/lib/data/maestros";

export const dynamic = "force-dynamic";

export default async function TecnicosPage() {
  return <TecnicosTable tecnicos={await listarTecnicos()} />;
}
