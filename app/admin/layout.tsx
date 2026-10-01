import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { cargarReferencias } from "@/lib/data/referencias";
import { contarProblemasAbiertos, contarReagendasPendientes, contarVisitas } from "@/lib/data/queries";
import { contarSolicitudesPendientes } from "@/lib/data/solicitudes-password";
import { listarUsuarios } from "@/lib/data/maestros";
import { ReferenciasProvider } from "@/lib/ui/referencias";
import AdminSidebar from "@/components/admin/AdminSidebar";
import VigilanteSesion from "@/components/ui/VigilanteSesion";
import { tiene } from "@/lib/permisos";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  if (sesion.usuario.rol === "TECNICO") redirect("/tecnico");

  const [referencias, visitas, reagendas, problemasAbiertos, usuarios, accesos] = await Promise.all([
    cargarReferencias(sesion.usuario.rol, sesion.permisos),
    contarVisitas(),
    contarReagendasPendientes(),
    contarProblemasAbiertos(),
    listarUsuarios(),
    contarSolicitudesPendientes(),
  ]);

  const nombreCoordinador = sesion.usuario.email
    .split("@")[0]
    .split(".")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");

  // El menú solo ofrece los módulos que el rol puede abrir.
  const visible = (item: { href: string }) =>
    tiene(sesion.permisos, `${item.href === "/admin" ? "panel" : item.href.split("/")[2]}.ver`);

  return (
    <ReferenciasProvider valor={referencias}>
      <VigilanteSesion />
      {/* En el celular el menú es un cajón que se abre desde la barra de arriba
          (ver AdminSidebar); desde lg vuelve a ser la columna fija de siempre. */}
      <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <AdminSidebar
          nombre={nombreCoordinador}
          rol={sesion.rolNombre}
          operacion={[
            { href: "/admin", label: "Panel", n: "" },
            { href: "/admin/visitas", label: "Visitas", n: visitas },
            { href: "/admin/reagendas", label: "Reagendas y pendientes", n: reagendas },
            { href: "/admin/problemas", label: "Problemas", n: problemasAbiertos },
          ].filter(visible)}
          maestros={[
            { href: "/admin/tecnicos", label: "Técnicos", n: referencias.tecnicos.length },
            // "Contraseñas pedidas" vive dentro de Usuarios: el número en rojo
            // es lo que queda sin atender en esa pestaña.
            {
              href: "/admin/usuarios",
              label: "Usuarios",
              n: usuarios.length,
              pendientes: tiene(sesion.permisos, "usuarios.contrasenas") ? accesos : 0,
            },
            { href: "/admin/clientes", label: "Clientes", n: referencias.clientes.length },
            { href: "/admin/malls", label: "Malls", n: referencias.malls.length },
            { href: "/admin/sucursales", label: "Sucursales", n: referencias.sucursales.length },
            {
              href: "/admin/checklist",
              label: "Checklist",
              n: referencias.motivos.length + referencias.problemas.length + referencias.trabajos.length,
            },
          ].filter(visible)}
        />
        <div className="min-w-0 flex flex-col">{children}</div>
      </div>
    </ReferenciasProvider>
  );
}
