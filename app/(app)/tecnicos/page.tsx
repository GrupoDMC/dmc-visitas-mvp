import { requerirVerTodas } from "@/lib/auth";
import { ProximaFase } from "@/components/ui/proxima-fase";

export default async function PaginaTecnicos() {
  await requerirVerTodas();

  return (
    <ProximaFase
      titulo="Técnicos"
      descripcion="Acá vas a mantener la ficha de cada técnico y ver su carga de visitas. Se habilita en la próxima entrega."
    />
  );
}
