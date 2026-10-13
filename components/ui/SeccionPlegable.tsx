"use client";

import { useState } from "react";

/**
 * Una sección del checklist que se despliega al pincharla: su título, cuántas
 * entradas lleva y, si tiene algo marcado adentro, cuántas.
 *
 * Nace plegada salvo que `abiertaInicial` diga lo contrario (por ejemplo,
 * porque ya trae algo marcado). `forzarAbierta` la mantiene abierta mientras se
 * filtra, para que lo que coincide no quede escondido.
 */
export default function SeccionPlegable({
  titulo,
  total,
  marcados = 0,
  abiertaInicial = false,
  forzarAbierta = false,
  tono = "panel",
  etiqueta,
  children,
}: {
  titulo: string;
  /** Una marca chica antes del título, p. ej. «Sección», para distinguirla de otros encabezados. */
  etiqueta?: string;
  total: number;
  marcados?: number;
  abiertaInicial?: boolean;
  forzarAbierta?: boolean;
  /** «panel» = el escritorio; «movil» = botones altos para el dedo. */
  tono?: "panel" | "movil";
  children: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(abiertaInicial);
  const visible = abierta || forzarAbierta;
  const movil = tono === "movil";

  return (
    <div className="border border-black/[.35] bg-[var(--color-surface-3)]">
      <button
        type="button"
        onClick={() => setAbierta(!visible)}
        aria-expanded={visible}
        className={`w-full flex items-center gap-2.5 px-3 ${movil ? "min-h-[52px]" : "min-h-10"} bg-transparent border-0 cursor-pointer text-left text-[var(--color-text)]`}
        style={{ background: visible ? "#e3e1e0" : "var(--color-surface)" }}
      >
        {etiqueta ? (
          <span className="flex-none text-[10px] tracking-[.09em] uppercase px-1.5 py-0.5 border border-black/[.35] opacity-70">
            {etiqueta}
          </span>
        ) : null}
        <span className={`flex-1 min-w-0 font-extrabold ${movil ? "text-[15px]" : "text-[13px]"} leading-[1.2]`}>
          {titulo}
        </span>
        {marcados > 0 ? (
          <span className="flex-none text-[11px] tracking-[.06em] uppercase font-extrabold text-[var(--color-accent-800)]">
            {marcados} {marcados === 1 ? "marcado" : "marcados"}
          </span>
        ) : null}
        <span className="flex-none text-[11px] tracking-[.06em] uppercase opacity-62 tabular-nums">{total}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          className="flex-none transition-transform duration-150"
          style={{ transform: `rotate(${visible ? 180 : 0}deg)` }}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {visible ? <div className="p-2 border-t border-black/[.25]">{children}</div> : null}
    </div>
  );
}
