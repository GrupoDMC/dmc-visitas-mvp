import UsuariosTable from "@/components/admin/maestros/UsuariosTable";
import { listarTecnicos, listarUsuarios } from "@/lib/data/maestros";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const [usuarios, tecnicos] = await Promise.all([listarUsuarios(), listarTecnicos()]);
  return <UsuariosTable usuarios={usuarios} tecnicos={tecnicos} />;
}
