"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { ItemNav } from "@/lib/navegacion";
import { NavLateral } from "./nav-lateral";
import { BotonSalir } from "./boton-salir";

const ANCHO_SIDEBAR = "15rem";

function Marca() {
  return (
    <div className="flex h-14 items-center border-b border-borde px-4">
      <span className="text-sm font-semibold text-texto">Visitas técnicas</span>
    </div>
  );
}

export function ShellApp({
  nombre,
  rol,
  items,
  children,
}: {
  nombre: string;
  rol: string;
  items: ItemNav[];
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const hamburguesa = useRef<HTMLButtonElement>(null);

  // Al cambiar de ruta el drawer se cierra solo. Se ajusta durante el render
  // y no en un efecto: así no hay un frame con el drawer abierto sobre la
  // pantalla nueva. Cubre también atrás/adelante del navegador, que no pasan
  // por el onClick de los enlaces.
  const [rutaPrevia, setRutaPrevia] = useState(pathname);
  if (rutaPrevia !== pathname) {
    setRutaPrevia(pathname);
    setAbierto(false);
  }

  // Escape cierra y devuelve el foco al botón que lo abrió.
  useEffect(() => {
    if (!abierto) return;

    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        setAbierto(false);
        hamburguesa.current?.focus();
      }
    }

    document.addEventListener("keydown", alTeclear);
    panel.current?.focus();

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto]);

  return (
    <div
      className="min-h-dvh lg:grid"
      style={{ gridTemplateColumns: `${ANCHO_SIDEBAR} 1fr` }}
    >
      {/* Escritorio: barra fija a la izquierda */}
      <aside className="hidden border-r border-borde bg-superficie lg:sticky lg:top-0 lg:block lg:h-dvh lg:overflow-y-auto">
        <Marca />
        <NavLateral items={items} />
      </aside>

      {/* Móvil: la misma barra dentro de un drawer */}
      {abierto ? (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Cerrar la navegación"
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-40 bg-texto/30"
          />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Navegación"
            tabIndex={-1}
            className="fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] overflow-y-auto border-r border-borde bg-superficie shadow-drawer outline-none"
          >
            <Marca />
            <NavLateral items={items} alNavegar={() => setAbierto(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-borde bg-superficie px-3 sm:px-4">
          <button
            ref={hamburguesa}
            type="button"
            onClick={() => setAbierto(true)}
            aria-label="Abrir la navegación"
            aria-expanded={abierto}
            className="-ml-1 flex size-11 shrink-0 items-center justify-center rounded-base text-texto hover:bg-fondo lg:hidden"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-texto">{nombre}</p>
            <p className="truncate text-xs text-suave">{rol}</p>
          </div>

          <BotonSalir />
        </header>

        <main className="flex-1 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
