"use client";

import { useEffect } from "react";

export interface ConfirmarCfg {
  titulo: string;
  texto: string;
  cta: string;
  accion: () => void;
}

/** Confirmación destructiva (quitar trabajo, problema o foto). */
export default function Confirmar({ cfg, onCerrar }: { cfg: ConfirmarCfg; onCerrar: () => void }) {
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-[rgba(45,43,43,.55)] flex flex-col justify-end items-center"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] bg-[var(--color-bg)] border-t-2 border-[var(--color-text)] animate-up-sheet"
      >
        <div className="px-4 pt-4 pb-3.5 border-b border-[var(--color-divider-soft)]">
          <div className="text-[10px] tracking-[.14em] uppercase text-[var(--color-accent-active)]">Confirmar</div>
          <div className="font-extrabold text-[19px] leading-[1.2] mt-1.5">{cfg.titulo}</div>
        </div>
        <div className="px-4 pt-3.5 pb-5">
          <p className="m-0 text-[15px] leading-[1.55]">{cfg.texto}</p>
          <button
            type="button"
            onClick={() => {
              cfg.accion();
              onCerrar();
            }}
            className="w-full min-h-[56px] flex items-center justify-between px-4.5 mt-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-active)]"
          >
            <span>{cfg.cta}</span>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="w-full min-h-[50px] mt-2.5 px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
