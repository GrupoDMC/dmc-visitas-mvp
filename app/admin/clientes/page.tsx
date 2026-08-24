import ClientesTable from "@/components/admin/maestros/ClientesTable";
import { listarClientes, listarSucursales } from "@/lib/data/maestros";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const [clientes, sucursales] = await Promise.all([listarClientes(), listarSucursales()]);
  return <ClientesTable clientes={clientes} sucursales={sucursales} />;
}
