"use client";

import { logoutAction } from "@/app/actions/auth";
import { prepararSalida } from "@/lib/ui/salir";
import { useUsuarioLocal } from "@/lib/ui/usuario-local";

/** "Cerrar sesión" de la pestaña Cuenta: avisa si hay actas sin enviar y limpia los borradores. */
export default function BotonCerrarSesion() {
  const uid = useUsuarioLocal();
  return (
    <button
      type="button"
      onClick={() => {
        if (prepararSalida(uid)) void logoutAction();
      }}
      className="w-full min-h-[52px] flex items-center justify-between px-4 mt-7 bg-transparent text-[var(--color-accent-active)] border border-[var(--color-accent)] font-extrabold text-sm cursor-pointer text-left hover:bg-[rgba(236,48,19,.1)]"
    >
      <span>Cerrar sesión</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M15 17l5-5-5-5M20 12H9M12 4H5v16h7" />
      </svg>
    </button>
  );
}
