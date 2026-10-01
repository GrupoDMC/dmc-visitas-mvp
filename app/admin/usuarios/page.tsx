import UsuariosView from "@/components/admin/UsuariosView";
import { listarTecnicos, listarUsuarios } from "@/lib/data/maestros";
import { listarSolicitudesPassword } from "@/lib/data/solicitudes-password";
import { listarRoles } from "@/lib/data/roles";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";
import { tiene } from "@/lib/permisos";

export const dynamic = "force-dynamic";

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const sesion = await sesionCon("usuarios.ver");
  if (!sesion) return <SinAcceso />;
  const { vista } = await searchParams;
  // Lo que no puede ver no baja al navegador, aunque la pestaña esté oculta.
  const [usuarios, tecnicos, solicitudes, roles] = await Promise.all([
    listarUsuarios(),
    listarTecnicos(),
    tiene(sesion.permisos, "usuarios.contrasenas") ? listarSolicitudesPassword() : [],
    listarRoles(),
  ]);

  return (
    <UsuariosView
      usuarios={usuarios}
      tecnicos={tecnicos}
      solicitudes={solicitudes}
      roles={roles}
      vistaInicial={vista === "contrasenas" || vista === "roles" ? vista : "cuentas"}
    />
  );
}
