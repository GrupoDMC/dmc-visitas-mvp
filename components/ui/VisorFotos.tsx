"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Visor de fotos a pantalla completa.
 *
 * Antes, tocar una foto del acta abría la imagen suelta en otra pestaña: se
 * perdía el acta, en el celular quedaba una pestaña huérfana y volver era un
 * viaje. Acá la foto se agranda encima de lo que ya estás mirando, se pasa a la
 * siguiente sin salir, y al cerrar sigues justo donde estabas.
 *
 * Sirve igual en el panel y en el celular: se maneja con el dedo, con el mouse
 * o con el teclado (← → para moverse, Esc para cerrar).
 */

export interface FotoVisible {
  /** URL de la imagen: /api/visita/foto/<id> o una data URL sin subir todavía. */
  src: string;
  titulo?: string | null;
  subtitulo?: string | null;
}

export default function VisorFotos({
  fotos,
  indice,
  onIndice,
  onCerrar,
}: {
  fotos: FotoVisible[];
  indice: number;
  onIndice: (i: number) => void;
  onCerrar: () => void;
}) {
  const [ampliada, setAmpliada] = useState(false);
  const total = fotos.length;
  const foto = fotos[indice];

  const ir = useCallback(
    (delta: number) => {
      if (total < 2) return;
      setAmpliada(false);
      onIndice((indice + delta + total) % total);
    },
    [indice, total, onIndice]
  );

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const teclas = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      else if (e.key === "ArrowRight") ir(1);
      else if (e.key === "ArrowLeft") ir(-1);
    };
    window.addEventListener("keydown", teclas);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener("keydown", teclas);
    };
  }, [ir, onCerrar]);

  if (!foto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={foto.titulo ?? "Foto del trabajo"}
      onClick={onCerrar}
      className="fixed inset-0 z-[90] flex flex-col bg-[rgba(24,22,21,.94)] animate-fade-in"
    >
      {/* Cabecera: qué foto es y cómo salir. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex-none flex items-center gap-3 px-4 py-3 border-b border-white/15 text-[#f3f2f2]"
      >
        <div className="min-w-0">
          <div className="font-extrabold text-sm leading-[1.2] truncate">{foto.titulo || "Foto del trabajo"}</div>
          {foto.subtitulo ? <div className="text-[11px] opacity-70 tabular-nums mt-0.5">{foto.subtitulo}</div> : null}
        </div>
        {total > 1 ? (
          <div className="ml-auto text-[11px] tracking-[.1em] uppercase opacity-70 tabular-nums">
            {indice + 1} de {total}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar la foto"
          className={`${total > 1 ? "" : "ml-auto"} w-11 h-11 flex-none grid place-items-center bg-transparent border border-white/25 text-[#f3f2f2] cursor-pointer hover:bg-white/10`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* La foto. Un toque la lleva a tamaño real y el contenedor se desplaza. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex-1 min-h-0 flex items-center justify-center p-3 ${ampliada ? "overflow-auto" : "overflow-hidden"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={foto.src}
          alt={foto.titulo ?? "Foto del trabajo"}
          onClick={() => setAmpliada((v) => !v)}
          className={
            ampliada
              ? "max-w-none w-auto h-auto cursor-zoom-out"
              : "max-w-full max-h-full object-contain cursor-zoom-in"
          }
          style={ampliada ? { minWidth: "100%" } : undefined}
        />
      </div>

      {/* Pie: pasar de foto y la ayuda del zoom. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex-none flex items-center gap-2.5 px-4 py-3 border-t border-white/15"
      >
        {total > 1 ? (
          <>
            <button
              type="button"
              onClick={() => ir(-1)}
              aria-label="Foto anterior"
              className="min-h-11 px-3.5 flex items-center gap-2 bg-transparent border border-white/25 text-[#f3f2f2] font-extrabold text-[13px] cursor-pointer hover:bg-white/10"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M15 6l-6 6 6 6" />
              </svg>
              <span>Anterior</span>
            </button>
            <button
              type="button"
              onClick={() => ir(1)}
              aria-label="Foto siguiente"
              className="min-h-11 px-3.5 flex items-center gap-2 bg-transparent border border-white/25 text-[#f3f2f2] font-extrabold text-[13px] cursor-pointer hover:bg-white/10"
            >
              <span>Siguiente</span>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => setAmpliada((v) => !v)}
          className="ml-auto min-h-11 px-3.5 flex items-center gap-2 bg-transparent border border-white/25 text-[#f3f2f2] font-extrabold text-[13px] cursor-pointer hover:bg-white/10"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5L21 21" />
            {ampliada ? <path d="M8 11h6" /> : <path d="M11 8v6M8 11h6" />}
          </svg>
          <span>{ampliada ? "Ajustar a la pantalla" : "Ver en grande"}</span>
        </button>
      </div>
    </div>
  );
}

/** Estado del visor: qué lista se está mirando y en qué foto va. */
export function useVisorFotos() {
  const [indice, setIndice] = useState<number | null>(null);
  return {
    indice,
    abierto: indice !== null,
    abrir: (i: number) => setIndice(i),
    cerrar: () => setIndice(null),
    mover: (i: number) => setIndice(i),
  };
}
