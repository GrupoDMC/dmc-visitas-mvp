import { requerirVerTodas } from "@/lib/auth";
import { ProximaFase } from "@/components/ui/proxima-fase";

export default async function PaginaVisitas() {
  await requerirVerTodas();

  return (
    <ProximaFase
      titulo="Visitas"
      descripcion="Acá vas a programar visitas, asignarles técnico y seguir su estado. Se habilita en la próxima entrega."
    />
  );
}
