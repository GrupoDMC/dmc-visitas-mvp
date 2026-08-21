import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitasPorTecnico } from "@/lib/mock/visitas";
import { HOY } from "@/lib/mock/queries";
import MobileShell from "@/components/mobile/MobileShell";
import PerfilHistorial from "@/components/mobile/PerfilHistorial";
import { logoutAction } from "@/app/actions/auth";

export default async function PerfilPage() {
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const visitas = getVisitasPorTecnico(sesion.tecnico.id);
  // Sin fila "Rol": el técnico solo tiene un rol posible y verlo no le aporta.
  const filas: { k: string; v: string }[] = [
    { k: "Nombre", v: sesion.tecnico.nombreCompleto },
    { k: "RUT", v: sesion.tecnico.rut },
    { k: "Correo", v: sesion.tecnico.email },
    { k: "Teléfono", v: sesion.tecnico.telefono ?? "—" },
  ];

  return (
    <MobileShell titulo="Mi cuenta">
      <div className="px-4 pt-[22px] pb-[26px] animate-fade-in">
        <h1 className="font-extrabold text-[28px] leading-[1.06] tracking-[-.03em] m-0 mb-4.5">Mi cuenta</h1>
        <div className="border-t-2 border-[var(--color-divider)]">
          {filas.map((f) => (
            <div key={f.k} className="flex gap-3 py-3.5 border-b border-black/[.15]">
              <div className="text-[10px] tracking-[.09em] uppercase opacity-62 min-w-[104px]">{f.k}</div>
              <div className="text-sm">{f.v}</div>
            </div>
          ))}
        </div>

        <PerfilHistorial visitas={visitas} hoy={HOY} />

        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full min-h-[52px] flex items-center px-4 mt-5.5 bg-transparent text-[var(--color-accent-active)] border border-[var(--color-accent)] font-extrabold text-sm cursor-pointer text-left hover:bg-[rgba(236,48,19,.1)]"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </MobileShell>
  );
}
