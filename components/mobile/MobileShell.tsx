"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { Toast, useToast } from "@/components/ui/Toast";

const TABS = [
  { href: "/tecnico", label: "Inicio" },
  { href: "/tecnico/visitas", label: "Visitas" },
  { href: "/tecnico/perfil", label: "Cuenta" },
];

export default function MobileShell({
  titulo,
  children,
  volverHref,
}: {
  titulo: string;
  children: React.ReactNode;
  /** Si se define, muestra el botón volver apuntando a esta ruta y oculta los tabs. */
  volverHref?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast, aviso } = useToast();
  const [saliendo, setSaliendo] = useState(false);
  const mostrarTabs = !volverHref;

  return (
    <div className="h-screen overflow-hidden flex justify-center bg-[#c9c7c6]">
      <div className="w-full max-w-[460px] min-w-0 bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col h-screen overflow-y-auto overflow-x-hidden relative">
        <div className="flex flex-col min-h-full">
          <div className="sticky top-0 z-20 bg-[var(--color-bg)] border-b-2 border-[var(--color-divider)]">
            <div className="flex items-center gap-2.5 px-4 py-2.5">
              {volverHref ? (
                <button
                  onClick={() => router.push(volverHref)}
                  aria-label="Volver"
                  className="w-[38px] h-[38px] -ml-2.5 grid place-items-center bg-transparent border-0 text-[var(--color-text)] cursor-pointer hover:bg-black/[.07]"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M19 12H5M11 18l-6-6 6-6" />
                  </svg>
                </button>
              ) : null}
              <Image src="/DMC-logo.png" alt="Grupo dMC" width={64} height={18} className="h-[18px] w-auto flex-none" />
              <div className="text-[9px] tracking-[.15em] uppercase opacity-62">{titulo}</div>
              <button
                type="button"
                disabled={saliendo}
                aria-label="Cerrar sesión"
                onClick={() => {
                  setSaliendo(true);
                  aviso("Sesión cerrada");
                  setTimeout(() => {
                    void logoutAction();
                  }, 700);
                }}
                className="ml-auto w-[34px] h-[34px] grid place-items-center bg-transparent border-0 text-[var(--color-text)] cursor-pointer hover:bg-black/[.07] disabled:opacity-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M15 17l5-5-5-5M20 12H9M12 4H5v16h7" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1">{children}</div>

          {mostrarTabs ? (
            <div className="sticky bottom-0 z-20 mt-auto bg-[var(--color-bg)] border-t-2 border-[var(--color-divider)] grid grid-cols-3">
              {TABS.map((t) => {
                const activo = pathname === t.href;
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className="relative min-h-[60px] flex flex-col items-center justify-center gap-1 hover:bg-black/5"
                    style={{ color: "var(--color-text)", opacity: activo ? 1 : 0.6 }}
                  >
                    {activo ? <span className="absolute top-0 left-0 right-0 h-[3px] bg-[var(--color-accent)]" /> : null}
                    <span className="font-extrabold text-[11px] tracking-[.09em] uppercase">{t.label}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
        <Toast texto={toast} />
      </div>
    </div>
  );
}
