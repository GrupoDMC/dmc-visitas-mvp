"use client";

import { useState } from "react";

export interface CampoFiltro {
  id: string;
  label: string;
  valor: string;
  opciones: { v: string; t: string }[];
  onChange: (valor: string) => void;
}

export interface ChipFiltro {
  label: string;
  onQuitar: () => void;
}

/**
 * Barra de filtros del panel: búsqueda, botón que despliega los selectores,
 * chips con lo que está filtrado y el conteo. Los selectores viven escondidos
 * hasta que se aprieta "Colocar filtro", igual que en el mockup.
 */
export default function FiltrosBar({
  busqueda,
  phBusqueda,
  onBusqueda,
  campos,
  chips,
  onLimpiar,
  conteo,
  acciones,
}: {
  /** Si se omite, la barra va sin caja de búsqueda (vista de problemas). */
  busqueda?: string;
  phBusqueda?: string;
  onBusqueda?: (valor: string) => void;
  campos: CampoFiltro[];
  chips: ChipFiltro[];
  onLimpiar: () => void;
  conteo: string;
  /** Botones extra a la derecha de los chips (por ejemplo "Nueva visita"). */
  acciones?: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);

  const textoBoton = abierto
    ? "Ocultar filtros"
    : chips.length
      ? `Editar filtros (${chips.length})`
      : "Colocar filtro";

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap px-7 py-4 border-b border-[var(--color-divider-soft)]">
        {onBusqueda ? (
          <div className="relative flex-1 min-w-[220px] max-w-[340px]">
            <input
              value={busqueda ?? ""}
              onChange={(e) => onBusqueda(e.target.value)}
              placeholder={phBusqueda}
              aria-label={phBusqueda}
              className="input pl-9.5"
            />
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text)"
              strokeWidth="2"
              className="absolute left-3 top-1/2 -translate-y-1/2 opacity-62 pointer-events-none"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M16.5 16.5L21 21" />
            </svg>
          </div>
        ) : null}

        <div className="flex items-center gap-2 flex-wrap" hidden={campos.length === 0}>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="btn btn-secondary min-h-10 px-3.5 gap-2.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 6h18M6 12h12M10 18h4" />
            </svg>
            <span>{textoBoton}</span>
          </button>

          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={c.onQuitar}
              className="tag tag-accent min-h-8 border-0 cursor-pointer gap-2 px-2.5 text-[11px] tracking-[.06em] uppercase"
            >
              <span>{c.label}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ))}

          {chips.length > 0 ? (
            <button
              type="button"
              onClick={onLimpiar}
              className="min-h-8 px-1 bg-transparent border-0 text-[var(--color-accent-active)] text-xs underline underline-offset-[3px] cursor-pointer"
            >
              Quitar todos
            </button>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-[11px] tracking-[.08em] uppercase opacity-62 tabular-nums">{conteo}</div>
          {acciones}
        </div>
      </div>

      {abierto && campos.length > 0 ? (
        <div className="px-7 pt-5 pb-5.5 border-b border-[var(--color-divider-soft)] bg-[var(--color-surface)] animate-fade-in">
          <div className="text-[10px] tracking-[.14em] uppercase text-[var(--color-accent-active)] mb-3.5">
            Elige por qué quieres filtrar
          </div>
          <div className="grid grid-cols-4 gap-4">
            {campos.map((c) => (
              <div key={c.id} className="field m-0 min-w-0">
                <label htmlFor={c.id}>{c.label}</label>
                <div className="relative">
                  <select
                    id={c.id}
                    value={c.valor}
                    onChange={(e) => c.onChange(e.target.value)}
                    className="input pr-9.5 appearance-none"
                  >
                    {c.opciones.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.t}
                      </option>
                    ))}
                  </select>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-text)"
                    strokeWidth="2.2"
                    className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2.5 mt-4.5">
            <button type="button" onClick={() => setAbierto(false)} className="btn btn-primary min-h-[42px] px-4.5 gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M4 12l5 5L20 6" />
              </svg>
              <span>Ver resultados</span>
            </button>
            <button type="button" onClick={onLimpiar} className="btn btn-secondary min-h-[42px] px-4.5">
              Limpiar filtros
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
