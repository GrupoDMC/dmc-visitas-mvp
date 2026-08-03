import { requerirVerTodas } from "@/lib/auth";
import { ProximaFase } from "@/components/ui/proxima-fase";

export default async function PaginaSucursales() {
  await requerirVerTodas();

  return (
    <ProximaFase
      titulo="Sucursales"
      descripcion="Acá vas a administrar las sucursales de cada cliente, con su dirección y comuna. Se habilita en la próxima entrega."
    />
  );
}
