import ClientesTable from "@/components/admin/maestros/ClientesTable";
import { listarClientes, listarSucursales } from "@/lib/data/maestros";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  if (!(await sesionCon("clientes.ver"))) return <SinAcceso />;
  const [clientes, sucursales] = await Promise.all([listarClientes(), listarSucursales()]);
  return <ClientesTable clientes={clientes} sucursales={sucursales} />;
}
