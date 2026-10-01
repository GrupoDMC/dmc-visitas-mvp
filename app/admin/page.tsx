import PanelDashboard from "@/components/admin/PanelDashboard";
import { buildPanelData, type PanelData, type Rango } from "@/lib/ui/panel-data";
import { hoyISO } from "@/lib/ui/fecha";
import SinAcceso from "@/components/admin/SinAcceso";
import { redirect } from "next/navigation";
import { getSesion, sesionCon } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPanelPage() {
  if (!(await sesionCon("panel.ver"))) {
    // Sin panel, se entra directo al primer módulo que el rol pueda abrir.
    const sesion = await getSesion();
    const destino = ["visitas", "reagendas", "problemas", "tecnicos", "usuarios", "clientes", "sucursales", "checklist"]
      .find((m) => sesion?.permisos.includes(`${m}.ver`));
    if (destino) redirect(`/admin/${destino}`);
    return <SinAcceso />;
  }
  const rangos: Rango[] = ["Hoy", "Semana", "Mes"];
  const hoy = hoyISO();
  const calculados = await Promise.all(rangos.map((r) => buildPanelData(r, hoy)));
  const data = Object.fromEntries(rangos.map((r, i) => [r, calculados[i]])) as Record<Rango, PanelData>;

  return <PanelDashboard data={data} />;
}
