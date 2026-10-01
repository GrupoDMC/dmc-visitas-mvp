import SucursalesTable from "@/components/admin/maestros/SucursalesTable";
import { listarClientes, listarSucursales } from "@/lib/data/maestros";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SucursalesPage() {
  if (!(await sesionCon("sucursales.ver"))) return <SinAcceso />;
  const [sucursales, clientes] = await Promise.all([listarSucursales(), listarClientes()]);
  return <SucursalesTable sucursales={sucursales} clientes={clientes} />;
}
