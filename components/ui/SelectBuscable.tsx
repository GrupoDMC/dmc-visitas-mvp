"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface OpcionSelect {
  v: string;
  t: string;
}

/**
 * Selector con búsqueda: se escribe y la lista se va filtrando al momento.
 *
 * Reemplaza al `<select>` nativo donde la lista es larga (clientes, sucursales,
 * técnicos, tipos de problema). Con 80 sucursales, un desplegable nativo obliga
 * a bajar a rueda hasta encontrarla; acá se escriben tres letras y queda.
 *
 * El valor sigue siendo el mismo string que usaba el `<select>`, así que los
 * formularios no cambian.
 */
export default function SelectBuscable({
  id,
  valor,
  opciones,
  onChange,
  placeholder = "Escribe para buscar…",
  ariaLabel,
  className = "",
}: {
  id?: string;
  valor: string;
  opciones: OpcionSelect[];
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const caja = useRef<HTMLDivElement>(null);

  const elegida = opciones.find((o) => o.v === valor) ?? null;

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!q) return opciones;
    return opciones.filter((o) => o.t.toLowerCase().includes(q));
  }, [opciones, texto]);

  // Un clic fuera cierra la lista y descarta lo tecleado sin elegir.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    setTexto("");
    setResaltado(0);
  }

  function elegir(o: OpcionSelect) {
    onChange(o.v);
    cerrar();
  }

  function onTeclas(e: React.KeyboardEvent) {
    if (e.key === "Escape") return cerrar();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setResaltado((i) => Math.min(filtradas.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter" && abierto) {
      e.preventDefault();
      const o = filtradas[resaltado];
      if (o) elegir(o);
    }
  }

  return (
    <div ref={caja} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={id ? `${id}-lista` : undefined}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        // Nada se autocompleta: el navegador ofrecía valores de otros formularios.
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={abierto ? texto : elegida?.t ?? ""}
        placeholder={elegida ? elegida.t : placeholder}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setResaltado(0);
        }}
        onKeyDown={onTeclas}
        className={`input pr-9.5 ${className}`}
      />
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
        <div
          id={id ? `${id}-lista` : undefined}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 max-h-[260px] overflow-y-auto bg-[var(--color-bg)] border-2 border-[var(--color-text)] shadow-[0_6px_18px_rgba(0,0,0,.18)]"
        >
          {filtradas.map((o, i) => {
            const activo = o.v === valor;
            return (
              <button
                key={o.v || `vacio-${i}`}
                type="button"
                role="option"
                aria-selected={activo}
                onMouseEnter={() => setResaltado(i)}
                onClick={() => elegir(o)}
                className="w-full flex items-center gap-2 min-h-10 px-3 text-left text-[14px] leading-[1.25] cursor-pointer border-0"
                style={{
                  background: i === resaltado ? "var(--color-surface)" : "transparent",
                  color: "var(--color-text)",
                  fontWeight: activo ? 800 : 400,
                }}
              >
                {activo ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M4 12l5 5L20 6" />
                  </svg>
                ) : (
                  <span className="w-3.5" />
                )}
                <span className="flex-1 min-w-0">{o.t}</span>
              </button>
            );
          })}
          {filtradas.length === 0 ? (
            <div className="px-3 py-3 text-[13px] opacity-66">Nada coincide con «{texto}».</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
