"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { Toast, useToast } from "@/components/ui/Toast";

interface NavItem {
  href: string;
  label: string;
  n: number | string;
}

export default function AdminSidebar({
  operacion,
  maestros,
  nombre,
  rol,
}: {
  operacion: NavItem[];
  maestros: NavItem[];
  nombre: string;
  rol: string;
}) {
  const pathname = usePathname();
  const { toast, aviso } = useToast();
  const [saliendo, setSaliendo] = useState(false);
  const iniciales = nombre
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function NavButton({ item }: { item: NavItem }) {
    const activo = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        href={item.href}
        className="relative w-full flex items-center gap-2.5 min-h-11 px-5 font-extrabold text-sm hover:bg-black/5"
        style={{ opacity: activo ? 1 : 0.86 }}
      >
        {activo ? (
          <span className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--color-accent)]" />
        ) : null}
        <span>{item.label}</span>
        <span className="ml-auto text-xs tabular-nums opacity-66">{item.n}</span>
      </Link>
    );
  }

  return (
    <div className="border-r-2 border-[var(--color-divider)] flex flex-col sticky top-0 h-screen">
      <div className="px-5 pt-[22px] pb-[18px] border-b-2 border-[var(--color-divider)]">
        <Image src="/DMC-logo.png" alt="Grupo dMC" width={124} height={53} />
        <div className="text-[9px] tracking-[.16em] uppercase opacity-62 mt-3">
          Sistema de técnicos · Coordinación
        </div>
      </div>

      <div className="pt-[18px] flex-1 overflow-y-auto">
        <div className="text-[9px] tracking-[.16em] uppercase opacity-60 px-5 pb-2">Operación</div>
        {operacion.map((item) => (
          <NavButton key={item.href} item={item} />
        ))}

        <div className="text-[9px] tracking-[.16em] uppercase opacity-60 px-5 pt-[22px] pb-2">Maestros</div>
        {maestros.map((item) => (
          <NavButton key={item.href} item={item} />
        ))}
      </div>

      <div className="border-t-2 border-[var(--color-divider)] px-5 pt-3.5 pb-3 flex items-center gap-2.5">
        <div className="w-[34px] h-[34px] shrink-0 bg-[var(--color-text)] text-[var(--color-bg)] grid place-items-center font-extrabold text-[13px]">
          {iniciales}
        </div>
        <div className="min-w-0">
          <div className="font-extrabold text-[13px] whitespace-nowrap overflow-hidden text-ellipsis">{nombre}</div>
          <div className="text-[10px] tracking-[.09em] uppercase opacity-62">{rol}</div>
        </div>
      </div>
      <div className="px-4 pb-4">
        <button
          type="button"
          disabled={saliendo}
          onClick={() => {
            // El aviso alcanza a leerse antes de que el redirect cambie de página.
            setSaliendo(true);
            aviso(`Sesión cerrada · ${nombre}`);
            setTimeout(() => {
              void logoutAction();
            }, 700);
          }}
          className="w-full min-h-[42px] flex items-center gap-2.5 px-3 bg-transparent border border-[var(--color-accent)] text-[var(--color-accent-active)] font-extrabold text-[13px] cursor-pointer text-left hover:bg-[rgba(236,48,19,.1)] disabled:opacity-60"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 17l5-5-5-5M20 12H9M12 4H5v16h7" />
          </svg>
          <span>{saliendo ? "Cerrando sesión…" : "Cerrar sesión"}</span>
        </button>
      </div>

      <Toast texto={toast} variante="panel" />
    </div>
  );
}
