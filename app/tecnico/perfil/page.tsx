import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitasPorTecnico } from "@/lib/data/visitas";
import { hoyISO } from "@/lib/ui/fecha";
import MobileShell from "@/components/mobile/MobileShell";
import PerfilHistorial from "@/components/mobile/PerfilHistorial";
import { logoutAction } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const tecnico = sesion.tecnico;
  const visitas = await getVisitasPorTecnico(tecnico.id);
  const iniciales = `${tecnico.nombres.trim().charAt(0)}${tecnico.apellidoPaterno.trim().charAt(0)}`.toUpperCase();
  // Sin fila "Rol": el técnico solo tiene un rol posible y verlo no le aporta.
  const filas: { k: string; v: string }[] = [
    { k: "RUT", v: tecnico.rut },
    { k: "Correo", v: tecnico.email },
    { k: "Teléfono", v: tecnico.telefono ?? "—" },
  ];

  return (
    <MobileShell titulo="Mi cuenta">
      <div className="px-4 pt-[22px] pb-[26px] animate-fade-in">
        <div className="flex items-center gap-3.5">
          <div
            aria-hidden="true"
            className="w-16 h-16 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-[22px] leading-none tracking-[.02em]"
          >
            {iniciales || "—"}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">Técnico en terreno</div>
            <h1 className="font-extrabold text-[24px] leading-[1.1] tracking-[-.03em] m-0 mt-1">{tecnico.nombreCompleto}</h1>
          </div>
        </div>

        <div className="mt-4.5 border border-[var(--color-divider)] bg-[var(--color-surface-3)] px-3.5">
          {filas.map((f, i) => (
            <div
              key={f.k}
              className={`flex items-baseline gap-3 py-3 ${i > 0 ? "border-t border-black/[.15]" : ""}`}
            >
              <div className="text-[10px] tracking-[.09em] uppercase opacity-62 w-[78px] flex-none">{f.k}</div>
              <div className="text-sm min-w-0 tabular-nums">{f.v}</div>
            </div>
          ))}
        </div>

        <PerfilHistorial visitas={visitas} hoy={hoyISO()} tecnicoId={tecnico.id} />

        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full min-h-[52px] flex items-center justify-between px-4 mt-7 bg-transparent text-[var(--color-accent-active)] border border-[var(--color-accent)] font-extrabold text-sm cursor-pointer text-left hover:bg-[rgba(236,48,19,.1)]"
          >
            <span>Cerrar sesión</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M15 17l5-5-5-5M20 12H9M12 4H5v16h7" />
            </svg>
          </button>
        </form>
      </div>
    </MobileShell>
  );
}
