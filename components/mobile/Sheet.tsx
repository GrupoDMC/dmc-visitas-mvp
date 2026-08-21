"use client";

import { useEffect } from "react";

/**
 * Hoja inferior del móvil — el patrón que usa el mockup para "Agregar trabajo
 * realizado", "Agregar un problema", la firma y los cambios de estado.
 * Ocupa el ancho de la columna (máx. 460px), entra desde abajo y bloquea el
 * scroll del documento mientras está abierta.
 */
export default function Sheet({
  titulo,
  eyebrow,
  onClose,
  children,
}: {
  titulo: string;
  /** Línea pequeña en rojo sobre el título (opcional). */
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-40 bg-[rgba(45,43,43,.5)] flex flex-col justify-end items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] max-h-[94vh] overflow-y-auto bg-[var(--color-bg)] border-t-2 border-[var(--color-text)] animate-up-sheet"
      >
        <div className="sticky top-0 z-10 bg-[var(--color-bg)] flex items-center gap-2.5 px-4 py-3.5 border-b-2 border-[var(--color-divider)]">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-active)]">{eyebrow}</div>
            ) : null}
            <div className={`font-extrabold text-[17px] leading-[1.2] ${eyebrow ? "mt-1" : ""}`}>{titulo}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-auto w-[38px] h-[38px] flex-none grid place-items-center bg-transparent border-0 cursor-pointer text-[var(--color-text)] hover:bg-black/[.08]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
