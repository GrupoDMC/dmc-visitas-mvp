import UsuariosView from "@/components/admin/UsuariosView";
import { listarTecnicos, listarUsuarios } from "@/lib/data/maestros";
import { listarSolicitudesPassword } from "@/lib/data/solicitudes-password";
import { listarRoles, permisosCelular } from "@/lib/data/roles";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";
import { tiene } from "@/lib/permisos";

export const dynamic = "force-dynamic";

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  // Usuarios aloja también a los técnicos: basta con poder ver cualquiera de los dos.
  const sesion = (await sesionCon("usuarios.ver")) ?? (await sesionCon("tecnicos.ver"));
  if (!sesion) return <SinAcceso />;
  const { vista } = await searchParams;
  // Lo que no puede ver no baja al navegador, aunque la pestaña esté oculta.
  const verRoles = tiene(sesion.permisos, "usuarios.roles");
  const [usuarios, tecnicos, solicitudes, roles, celular] = await Promise.all([
    tiene(sesion.permisos, "usuarios.ver") ? listarUsuarios() : [],
    tiene(sesion.permisos, "tecnicos.ver") ? listarTecnicos() : [],
    tiene(sesion.permisos, "usuarios.contrasenas") ? listarSolicitudesPassword() : [],
    tiene(sesion.permisos, "usuarios.ver") || verRoles ? listarRoles() : null,
    verRoles ? permisosCelular() : [],
  ]);

  return (
    <UsuariosView
      usuarios={usuarios}
      tecnicos={tecnicos}
      solicitudes={solicitudes}
      roles={roles}
      permisosCelular={celular}
      vistaInicial={vista === "contrasenas" || vista === "roles" || vista === "tecnicos" ? vista : "cuentas"}
    />
  );
}
