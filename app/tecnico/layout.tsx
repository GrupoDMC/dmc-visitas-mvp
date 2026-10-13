import { redirect } from "next/navigation";
import { getSesion, rutaSinSesion } from "@/lib/auth";
import { cargarReferenciasTecnico } from "@/lib/data/referencias";
import { ReferenciasProvider } from "@/lib/ui/referencias";
import { UsuarioLocalProvider } from "@/lib/ui/usuario-local";
import VigilanteSesion from "@/components/ui/VigilanteSesion";

export const dynamic = "force-dynamic";

export default async function TecnicoLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesion();
  if (!sesion) redirect(await rutaSinSesion());
  if (sesion.usuario.rol !== "TECNICO") redirect("/admin");

  // Clientes, sucursales y catálogos: los usa "Agregar visita" desde el celular.
  const referencias = await cargarReferenciasTecnico(sesion.permisos);

  return (
    <UsuarioLocalProvider usuarioId={sesion.usuario.id}>
      <ReferenciasProvider valor={referencias}>
        <VigilanteSesion />
        {children}
      </ReferenciasProvider>
    </UsuarioLocalProvider>
  );
}
