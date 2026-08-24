import PanelDashboard from "@/components/admin/PanelDashboard";
import { buildPanelData, type PanelData, type Rango } from "@/lib/ui/panel-data";
import { hoyISO } from "@/lib/ui/fecha";

export const dynamic = "force-dynamic";

export default async function AdminPanelPage() {
  const rangos: Rango[] = ["Hoy", "Semana", "Mes"];
  const hoy = hoyISO();
  const calculados = await Promise.all(rangos.map((r) => buildPanelData(r, hoy)));
  const data = Object.fromEntries(rangos.map((r, i) => [r, calculados[i]])) as Record<Rango, PanelData>;

  return <PanelDashboard data={data} />;
}
