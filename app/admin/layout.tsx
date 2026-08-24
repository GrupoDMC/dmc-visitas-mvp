import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { cargarReferencias } from "@/lib/data/referencias";
import { contarProblemasAbiertos, contarReagendasPendientes, contarVisitas } from "@/lib/data/queries";
import { listarUsuarios } from "@/lib/data/maestros";
import { ReferenciasProvider } from "@/lib/ui/referencias";
import AdminSidebar from "@/components/admin/AdminSidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  if (sesion.usuario.rol === "TECNICO") redirect("/tecnico");

  const [referencias, visitas, reagendas, problemasAbiertos, usuarios] = await Promise.all([
    cargarReferencias(),
    contarVisitas(),
    contarReagendasPendientes(),
    contarProblemasAbiertos(),
    listarUsuarios(),
  ]);

  const nombreCoordinador = sesion.usuario.email
    .split("@")[0]
    .split(".")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");

  return (
    <ReferenciasProvider valor={referencias}>
      <div
        className="grid min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]"
        style={{ gridTemplateColumns: "248px minmax(0,1fr)" }}
      >
        <AdminSidebar
          nombre={nombreCoordinador}
          rol={sesion.usuario.rol === "ADMIN" ? "Administrador" : "Coordinador"}
          operacion={[
            { href: "/admin", label: "Panel", n: "" },
            { href: "/admin/visitas", label: "Visitas", n: visitas },
            { href: "/admin/reagendas", label: "Reagendas y pendientes", n: reagendas },
            { href: "/admin/problemas", label: "Problemas", n: problemasAbiertos },
          ]}
          maestros={[
            { href: "/admin/tecnicos", label: "Técnicos", n: referencias.tecnicos.length },
            { href: "/admin/usuarios", label: "Usuarios", n: usuarios.length },
            { href: "/admin/clientes", label: "Clientes", n: referencias.clientes.length },
            { href: "/admin/sucursales", label: "Sucursales", n: referencias.sucursales.length },
            {
              href: "/admin/checklist",
              label: "Checklist",
              n: referencias.motivos.length + referencias.problemas.length + referencias.trabajos.length,
            },
          ]}
        />
        <div className="min-w-0 flex flex-col">{children}</div>
      </div>
    </ReferenciasProvider>
  );
}
