import PanelDashboard from "@/components/admin/PanelDashboard";
import { buildPanelData, type Rango } from "@/lib/ui/panel-data";

export default function AdminPanelPage() {
  const rangos: Rango[] = ["Hoy", "Semana", "Mes"];
  const data = Object.fromEntries(rangos.map((r) => [r, buildPanelData(r)])) as Record<Rango, ReturnType<typeof buildPanelData>>;

  return <PanelDashboard data={data} />;
}
