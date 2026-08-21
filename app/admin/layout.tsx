import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitasCompletas } from "@/lib/mock/visitas";
import { getProblemasAbiertos } from "@/lib/mock/queries";
import { tecnicos, usuarios, clientes, sucursales } from "@/lib/mock/maestros";
import { catalogoMotivo, catalogoProblema, catalogoTrabajo } from "@/lib/mock/catalogos";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  if (sesion.usuario.rol === "TECNICO") redirect("/tecnico");

  const visitas = getVisitasCompletas();
  const reagendas = visitas.filter((v) => v.estado === "REAGENDADA" || v.estado === "PENDIENTE");
  const problemasAbiertos = getProblemasAbiertos();
  const nombreCoordinador = sesion.usuario.email
    .split("@")[0]
    .split(".")
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");

  return (
    <div className="grid min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]" style={{ gridTemplateColumns: "248px minmax(0,1fr)" }}>
      <AdminSidebar
        nombre={nombreCoordinador}
        rol={sesion.usuario.rol === "ADMIN" ? "Administrador" : "Coordinador"}
        operacion={[
          { href: "/admin", label: "Panel", n: "" },
          { href: "/admin/visitas", label: "Visitas", n: visitas.length },
          { href: "/admin/reagendas", label: "Reagendas y pendientes", n: reagendas.length },
          { href: "/admin/problemas", label: "Problemas", n: problemasAbiertos.length },
        ]}
        maestros={[
          { href: "/admin/tecnicos", label: "Técnicos", n: tecnicos.length },
          { href: "/admin/usuarios", label: "Usuarios", n: usuarios.length },
          { href: "/admin/clientes", label: "Clientes", n: clientes.length },
          { href: "/admin/sucursales", label: "Sucursales", n: sucursales.length },
          {
            href: "/admin/checklist",
            label: "Checklist",
            n: catalogoMotivo.length + catalogoProblema.length + catalogoTrabajo.length,
          },
        ]}
      />
      <div className="min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
