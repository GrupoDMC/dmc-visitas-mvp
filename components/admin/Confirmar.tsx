"use client";

import { useEffect } from "react";

export interface ConfirmarCfg {
  titulo: string;
  texto: string;
  cta: string;
  accion: () => void;
}

/**
 * Confirmación antes de borrar — el diálogo `confirmarAbierto` del mockup de
 * coordinación. Nada se elimina hasta que se aprieta el botón rojo.
 */
export default function Confirmar({ cfg, onCerrar }: { cfg: ConfirmarCfg; onCerrar: () => void }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] bg-[rgba(45,43,43,.55)] grid place-items-center p-6"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] bg-[var(--color-bg)] border-2 border-[var(--color-text)] animate-up-dlg"
      >
        <div className="px-5 py-4.5 border-b border-[var(--color-divider-soft)]">
          <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">Confirmar</div>
          <div className="font-extrabold text-[19px] leading-[1.2] mt-1.5">{cfg.titulo}</div>
        </div>
        <div className="px-5 pt-4.5 pb-5">
          <p className="m-0 text-sm leading-[1.6]">{cfg.texto}</p>
          <div className="flex gap-2.5 justify-end mt-5">
            <button type="button" className="btn btn-secondary min-h-11 px-4.5" onClick={onCerrar}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary min-h-11 px-4.5"
              onClick={() => {
                cfg.accion();
                onCerrar();
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
              </svg>
              <span>{cfg.cta}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
