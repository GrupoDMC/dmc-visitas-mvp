import MallsTable from "@/components/admin/maestros/MallsTable";
import { listarClientes, listarMalls, listarSucursales } from "@/lib/data/maestros";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MallsPage() {
  if (!(await sesionCon("malls.ver"))) return <SinAcceso />;
  const [malls, sucursales, clientes] = await Promise.all([listarMalls(), listarSucursales(), listarClientes()]);
  return <MallsTable malls={malls} sucursales={sucursales} clientes={clientes} />;
}
