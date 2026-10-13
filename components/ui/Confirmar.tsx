"use client";

import { useEffect } from "react";

export interface ConfirmarCfg {
  titulo: string;
  texto: string;
  cta: string;
  /** Puede ser asíncrona: el diálogo se cierra sin esperar a que termine. */
  accion: () => void | Promise<void>;
}

/**
 * Confirmación antes de quitar o borrar algo. Nada se elimina hasta que se
 * aprieta el botón.
 *
 * `mobile` es la hoja que sube desde abajo en el celular (quitar un trabajo,
 * un problema o una foto) y bloquea el scroll de atrás; `panel` es el diálogo
 * centrado de coordinación —el `confirmarAbierto` del mockup— y se cierra con
 * Escape.
 */
export default function Confirmar({
  cfg,
  onCerrar,
  variante = "panel",
}: {
  cfg: ConfirmarCfg;
  onCerrar: () => void;
  variante?: "mobile" | "panel";
}) {
  const enCelular = variante === "mobile";

  useEffect(() => {
    if (!enCelular) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [enCelular]);

  useEffect(() => {
    if (enCelular) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [enCelular, onCerrar]);

  const confirmar = () => {
    cfg.accion();
    onCerrar();
  };
  const basurero = (tam: number) => (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  );

  if (enCelular) {
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
              onClick={confirmar}
              className="w-full min-h-[56px] flex items-center justify-between px-4.5 mt-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-active)]"
            >
              <span>{cfg.cta}</span>
              {basurero(19)}
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] bg-[rgba(45,43,43,.55)] grid place-items-center p-3 sm:p-6"
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
            <button type="button" className="btn btn-primary min-h-11 px-4.5" onClick={confirmar}>
              {basurero(17)}
              <span>{cfg.cta}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
