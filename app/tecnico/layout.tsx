import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { cargarReferenciasTecnico } from "@/lib/data/referencias";
import { ReferenciasProvider } from "@/lib/ui/referencias";

export const dynamic = "force-dynamic";

export default async function TecnicoLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  if (sesion.usuario.rol !== "TECNICO") redirect("/admin");

  // Clientes, sucursales y catálogos: los usa "Agregar visita" desde el celular.
  const referencias = await cargarReferenciasTecnico();

  return <ReferenciasProvider valor={referencias}>{children}</ReferenciasProvider>;
}
