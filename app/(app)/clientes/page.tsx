import { requerirVerTodas } from "@/lib/auth";
import { ProximaFase } from "@/components/ui/proxima-fase";

export default async function PaginaClientes() {
  await requerirVerTodas();

  return (
    <ProximaFase
      titulo="Clientes"
      descripcion="Acá vas a mantener el listado de clientes y sus datos de contacto. Se habilita en la próxima entrega."
    />
  );
}
