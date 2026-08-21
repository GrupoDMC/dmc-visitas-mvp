"use client";

import { useEffect, useRef, useState } from "react";
import Sheet from "./Sheet";
import { fmtRut } from "@/lib/ui/formato";

export interface FirmaGuardada {
  imagen: string;
  nombre: string;
  rut: string;
  hora: string;
}

/**
 * Modal de firma de la tienda: quien firma puede corregir su nombre y RUT antes
 * de firmar sobre el recuadro. El canvas se dibuja al doble de resolución para
 * que el trazo no salga pixelado en el acta.
 */
export default function FirmaSheet({
  nombreInicial,
  rutInicial,
  onConfirmar,
  onCerrar,
  onAviso,
}: {
  nombreInicial: string;
  rutInicial: string;
  onConfirmar: (firma: FirmaGuardada) => void;
  onCerrar: () => void;
  onAviso: (texto: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [vacia, setVacia] = useState(true);
  const [nombre, setNombre] = useState(nombreInicial);
  const [rut, setRut] = useState(fmtRut(rutInicial));

  // Solo al montar: deja el lienzo en blanco antes del primer trazo.
  useEffect(() => {
    limpiar();
  }, []);

  function ctx() {
    const c = canvasRef.current;
    if (!c) return null;
    const g = c.getContext("2d");
    if (!g) return null;
    g.lineWidth = 5;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#201e1d";
    return g;
  }

  function posicion(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (c.width / r.width),
      y: (e.clientY - r.top) * (c.height / r.height),
    };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ctx()) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dibujando.current = true;
    ultimo.current = posicion(e);
    setVacia(false);
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const g = ctx();
    if (!g || !ultimo.current) return;
    const p = posicion(e);
    g.beginPath();
    g.moveTo(ultimo.current.x, ultimo.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    ultimo.current = p;
  }

  function onUp() {
    dibujando.current = false;
    ultimo.current = null;
  }

  function limpiar() {
    const c = canvasRef.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    setVacia(true);
  }

  function confirmar() {
    if (vacia) {
      onAviso("Falta firmar en el recuadro");
      return;
    }
    if (!nombre.trim()) {
      onAviso("Escribe el nombre de quien firma");
      return;
    }
    const c = canvasRef.current;
    if (!c) return;
    const ahora = new Date();
    onConfirmar({
      imagen: c.toDataURL("image/png"),
      nombre: nombre.trim(),
      rut: rut.trim(),
      hora: `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`,
    });
  }

  return (
    <Sheet titulo="Firma de la tienda" onClose={onCerrar}>
      <div className="p-4">
        <div className="flex gap-3 mb-3.5">
          <div className="flex-1 min-w-0">
            <label htmlFor="fi-nom" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
              Nombre
            </label>
            <input
              id="fi-nom"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Quien firma"
              className="w-full min-h-[52px] px-3.5 py-3 text-base bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label htmlFor="fi-rut" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
              RUT
            </label>
            <input
              id="fi-rut"
              inputMode="numeric"
              value={rut}
              onChange={(e) => setRut(fmtRut(e.target.value))}
              placeholder="11.111.111-1"
              className="w-full min-h-[52px] px-3.5 py-3 text-base tabular-nums bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none"
            />
          </div>
        </div>

        <div className="text-[10px] tracking-[.12em] uppercase opacity-66 mb-1.5">Firma dentro del recuadro</div>
        <div className="relative border border-[var(--color-divider)] bg-[var(--color-surface-3)]">
          <canvas
            ref={canvasRef}
            width={880}
            height={440}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
            className="block w-full h-[220px] touch-none cursor-crosshair"
          />
          <div className="absolute left-3.5 right-3.5 bottom-[34px] h-px bg-[var(--color-divider-soft)] pointer-events-none" />
        </div>

        <div className="flex justify-between items-center mt-2">
          <button
            type="button"
            onClick={limpiar}
            className="min-h-11 px-1 bg-transparent border-0 text-[var(--color-accent-active)] text-[13px] underline underline-offset-4 cursor-pointer"
          >
            Limpiar
          </button>
          <div className="text-xs opacity-62">La pantalla no se mueve mientras firmas</div>
        </div>

        <button
          type="button"
          onClick={confirmar}
          className="w-full min-h-[58px] flex items-center justify-between px-4.5 mt-2 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-active)]"
        >
          <span>Confirmar firma</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M4 12l5 5L20 6" />
          </svg>
        </button>
      </div>
    </Sheet>
  );
}
