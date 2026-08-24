import SucursalesTable from "@/components/admin/maestros/SucursalesTable";
import { listarClientes, listarSucursales } from "@/lib/data/maestros";

export const dynamic = "force-dynamic";

export default async function SucursalesPage() {
  const [sucursales, clientes] = await Promise.all([listarSucursales(), listarClientes()]);
  return <SucursalesTable sucursales={sucursales} clientes={clientes} />;
}
