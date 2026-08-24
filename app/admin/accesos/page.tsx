import SolicitudesPasswordView from "@/components/admin/SolicitudesPasswordView";
import { listarSolicitudesPassword } from "@/lib/data/solicitudes-password";

export const dynamic = "force-dynamic";

export default async function AccesosPage() {
  const solicitudes = await listarSolicitudesPassword();
  return <SolicitudesPasswordView solicitudes={solicitudes} />;
}
