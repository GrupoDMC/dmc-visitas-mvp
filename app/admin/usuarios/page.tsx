import UsuariosView from "@/components/admin/UsuariosView";
import { listarTecnicos, listarUsuarios } from "@/lib/data/maestros";
import { listarSolicitudesPassword } from "@/lib/data/solicitudes-password";

export const dynamic = "force-dynamic";

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const { vista } = await searchParams;
  const [usuarios, tecnicos, solicitudes] = await Promise.all([
    listarUsuarios(),
    listarTecnicos(),
    listarSolicitudesPassword(),
  ]);

  return (
    <UsuariosView
      usuarios={usuarios}
      tecnicos={tecnicos}
      solicitudes={solicitudes}
      vistaInicial={vista === "contrasenas" ? "contrasenas" : "cuentas"}
    />
  );
}
