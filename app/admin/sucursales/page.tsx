import SucursalesTable from "@/components/admin/maestros/SucursalesTable";
import { listarClientes, listarMalls, listarSucursales } from "@/lib/data/maestros";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SucursalesPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  if (!(await sesionCon("sucursales.ver"))) return <SinAcceso />;
  const [{ cliente }, sucursales, clientes, malls] = await Promise.all([
    searchParams,
    listarSucursales(),
    listarClientes(),
    listarMalls(),
  ]);
  return <SucursalesTable sucursales={sucursales} clientes={clientes} malls={malls} clienteInicial={cliente ?? ""} />;
}
