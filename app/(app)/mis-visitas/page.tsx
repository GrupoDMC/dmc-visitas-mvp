import { requerirSesion } from "@/lib/auth";
import { ProximaFase } from "@/components/ui/proxima-fase";

export default async function PaginaMisVisitas() {
  await requerirSesion();

  return (
    <ProximaFase
      titulo="Mis visitas"
      descripcion="Acá vas a ver las visitas que tenés asignadas y vas a poder registrar lo que hiciste en terreno. Se habilita en la próxima entrega."
    />
  );
}
