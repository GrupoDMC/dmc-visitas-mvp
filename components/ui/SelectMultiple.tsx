"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sinTildes } from "@/lib/ui/formato";
import type { OpcionSelect } from "@/components/ui/SelectBuscable";

/**
 * Selector de varias opciones, con búsqueda. Hermano de `SelectBuscable`.
 *
 * Lo que se va marcando queda en el borrador del componente y se entrega de una
 * vez al cerrar la lista: cada cambio de filtro navega, y entregar casilla por
 * casilla haría que la segunda pisara a la primera mientras el servidor responde.
 */
export default function SelectMultiple({
  id,
  valores,
  opciones,
  onChange,
  textoVacio,
  placeholder = "Escribe para filtrar...",
  ariaLabel,
}: {
  id?: string;
  valores: string[];
  opciones: OpcionSelect[];
  onChange: (v: string[]) => void;
  /** Lo que se lee con nada marcado: «Todos los estados». */
  textoVacio: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [borrador, setBorrador] = useState<string[]>(valores);
  const caja = useRef<HTMLDivElement>(null);

  // Con la lista cerrada manda lo que dice la URL.
  useEffect(() => {
    if (!abierto) setBorrador(valores);
  }, [valores, abierto]);

  const filtradas = useMemo(() => {
    const q = sinTildes(texto.trim());
    if (!q) return opciones;
    return opciones.filter((o) => sinTildes(o.t).includes(q));
  }, [opciones, texto]);

  function cerrar() {
    setAbierto(false);
    setTexto("");
    const igual = borrador.length === valores.length && borrador.every((v) => valores.includes(v));
    if (!igual) onChange(borrador);
  }

  // Un clic fuera cierra la lista y entrega lo marcado.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, borrador, valores]);

  const alternar = (v: string) =>
    setBorrador((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const nombres = borrador.map((v) => opciones.find((o) => o.v === v)?.t).filter(Boolean) as string[];
  const resumen =
    nombres.length === 0 ? textoVacio : nombres.length <= 2 ? nombres.join(", ") : `${nombres.length} seleccionados`;

  return (
    <div ref={caja} className="relative">
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={abierto}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        onKeyDown={(e) => {
          if (e.key === "Escape" && abierto) cerrar();
        }}
        className="input pr-9.5 text-left truncate cursor-pointer"
        style={{ opacity: nombres.length === 0 ? 0.75 : 1 }}
      >
        {resumen}
      </button>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-text)"
        strokeWidth="2.2"
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ transform: `translateY(-50%) rotate(${abierto ? 180 : 0}deg)` }}
      >
        <path d="M6 9l6 6 6-6" />
      </svg>

      {abierto ? (
        <div className="absolute left-0 right-0 top-full z-30 bg-[var(--color-bg)] border-2 border-[var(--color-text)] shadow-[0_6px_18px_rgba(0,0,0,.18)]">
          {opciones.length >= 7 ? (
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cerrar();
              }}
              placeholder={placeholder}
              aria-label={placeholder}
              autoComplete="off"
              spellCheck={false}
              className="input border-0 border-b border-[var(--color-divider)]"
            />
          ) : null}
          <div id={id ? `${id}-lista` : undefined} role="listbox" aria-multiselectable className="max-h-[260px] overflow-y-auto">
            {filtradas.map((o) => {
              const marcada = borrador.includes(o.v);
              return (
                <button
                  key={o.v}
                  type="button"
                  role="option"
                  aria-selected={marcada}
                  onClick={() => alternar(o.v)}
                  className="w-full flex items-center gap-2.5 min-h-10 px-3 text-left text-[14px] leading-[1.25] cursor-pointer border-0 bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                  style={{ fontWeight: marcada ? 800 : 400 }}
                >
                  <span
                    className="w-4 h-4 shrink-0 border-2 border-current grid place-items-center"
                    style={{ background: marcada ? "var(--color-text)" : "transparent" }}
                  >
                    {marcada ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" strokeWidth="4">
                        <path d="M4 12l5 5L20 6" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="flex-1 min-w-0">{o.t}</span>
                </button>
              );
            })}
            {filtradas.length === 0 ? (
              <div className="px-3 py-3 text-[13px] opacity-66">
                {texto.trim() ? `Nada coincide con «${texto}».` : "No hay opciones."}
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 px-3 min-h-10 border-t border-[var(--color-divider)] bg-[var(--color-surface)]">
            <button
              type="button"
              disabled={borrador.length === 0}
              onClick={() => setBorrador([])}
              className="bg-transparent border-0 p-0 text-xs underline underline-offset-[3px] cursor-pointer text-[var(--color-accent-active)] disabled:opacity-40 disabled:cursor-default"
            >
              Quitar selección
            </button>
            <button type="button" onClick={cerrar} className="btn btn-primary min-h-8 px-3 text-xs">
              Aplicar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
