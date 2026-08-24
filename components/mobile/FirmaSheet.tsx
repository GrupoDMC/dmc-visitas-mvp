"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Sheet from "./Sheet";
import { fmtRut, rutCompleto, rutDvCorrecto } from "@/lib/ui/formato";

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
 *
 * En el celular, firmar dentro de una tira de 220 px de alto sale mal siempre.
 * Por eso, cuando la pantalla está en vertical, el lienzo se abre a pantalla
 * completa y girado 90°: el encargado gira el teléfono y firma a lo ancho, con
 * el triple de espacio. Si el navegador deja bloquear la orientación (Android),
 * se bloquea; en iOS no existe esa API y el giro es solo visual, que para el
 * caso da igual porque el lienzo ya quedó apaisado.
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
  const contenedorRef = useRef<HTMLDivElement>(null);
  const dibujando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [vacia, setVacia] = useState(true);
  const [nombre, setNombre] = useState(nombreInicial);
  const [rut, setRut] = useState(fmtRut(rutInicial));
  const [aLoAncho, setALoAncho] = useState(false);
  /** true cuando el lienzo está girado por CSS y hay que corregir el puntero. */
  const [girado, setGirado] = useState(false);

  const limpiar = useCallback(() => {
    const c = canvasRef.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    setVacia(true);
  }, []);

  // Solo al montar: deja el lienzo en blanco antes del primer trazo.
  useEffect(() => {
    limpiar();
  }, [limpiar]);

  // Mientras se firma a lo ancho, el lienzo se gira solo si la pantalla sigue
  // en vertical. Si el teléfono se gira de verdad, se deshace el giro por CSS.
  useEffect(() => {
    if (!aLoAncho) return;
    const revisar = () => setGirado(window.innerHeight > window.innerWidth);
    revisar();
    window.addEventListener("resize", revisar);
    window.addEventListener("orientationchange", revisar);
    return () => {
      window.removeEventListener("resize", revisar);
      window.removeEventListener("orientationchange", revisar);
    };
  }, [aLoAncho]);

  useEffect(() => {
    if (!aLoAncho) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Android permite fijar la orientación dentro de pantalla completa; iOS no
    // implementa ninguna de las dos y simplemente rechaza la promesa.
    const orientacion = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    void document.documentElement.requestFullscreen?.().then(
      () => orientacion.lock?.("landscape").catch(() => {}),
      () => {}
    );
    return () => {
      document.body.style.overflow = previo;
      orientacion.unlock?.();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [aLoAncho]);

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

  /**
   * Coordenadas del puntero dentro del lienzo.
   *
   * Con el lienzo girado por CSS, getBoundingClientRect() devuelve la caja YA
   * girada: hay que deshacer la rotación a mano. Con rotate(90°) un punto local
   * (lx, ly) se ve en pantalla como (−ly, lx), así que la inversa es
   * lx = sy, ly = −sx, midiendo desde el centro.
   */
  function posicion(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const centroX = r.left + r.width / 2;
    const centroY = r.top + r.height / 2;

    // Tamaño en CSS del lienzo SIN girar.
    const anchoCss = girado ? r.height : r.width;
    const altoCss = girado ? r.width : r.height;

    let lx: number;
    let ly: number;
    if (girado) {
      lx = e.clientY - centroY;
      ly = -(e.clientX - centroX);
    } else {
      lx = e.clientX - centroX;
      ly = e.clientY - centroY;
    }

    return {
      x: (lx + anchoCss / 2) * (c.width / anchoCss),
      y: (ly + altoCss / 2) * (c.height / altoCss),
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

  function confirmar() {
    if (vacia) return onAviso("Falta firmar en el recuadro");
    if (!nombre.trim()) return onAviso("Escribe el nombre de quien firma");
    if (rut.trim() && !rutCompleto(rut)) return onAviso("El RUT de quien firma está incompleto");
    if (rut.trim() && !rutDvCorrecto(rut)) return onAviso("El RUT de quien firma no es válido: revisa el dígito verificador");

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

  const lienzo = (
    <canvas
      ref={canvasRef}
      width={1400}
      height={560}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onUp}
      className="block touch-none cursor-crosshair bg-[var(--color-surface-3)]"
    />
  );

  // ── Pantalla completa, a lo ancho ─────────────────────────────────────────
  if (aLoAncho) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Firma a lo ancho"
        className="fixed inset-0 z-[80] bg-[var(--color-bg)] flex flex-col"
      >
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b-2 border-[var(--color-divider)] flex-none">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[.12em] uppercase opacity-62">Firma de la tienda</div>
            <div className="font-extrabold text-[15px] leading-[1.2] truncate">{nombre || "Responsable"}</div>
          </div>
          <button
            type="button"
            onClick={limpiar}
            className="ml-auto min-h-11 px-3 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-[13px] cursor-pointer"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={confirmar}
            className="min-h-11 px-4 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-[13px] cursor-pointer"
          >
            Confirmar firma
          </button>
          <button
            type="button"
            onClick={() => setALoAncho(false)}
            aria-label="Volver"
            className="w-11 h-11 grid place-items-center bg-transparent border-0 cursor-pointer text-[var(--color-text)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div ref={contenedorRef} className="flex-1 min-h-0 relative overflow-hidden">
          <div
            className="absolute inset-0 grid place-items-center"
            style={
              girado
                ? // El lienzo ocupa el alto de la pantalla como si fuera su ancho.
                  { transform: "rotate(90deg)", transformOrigin: "center" }
                : undefined
            }
          >
            <div
              className="border border-[var(--color-divider)] relative"
              // Girado, el lienzo toma el ALTO de la pantalla como ancho: al
              // rotarlo 90° queda ocupando la pantalla completa a lo ancho.
              style={
                girado
                  ? { width: "calc(100vh - 100px)", height: "calc(100vw - 16px)" }
                  : { width: "100%", height: "100%" }
              }
            >
              <canvas
                ref={canvasRef}
                width={1400}
                height={560}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onPointerLeave={onUp}
                className="block w-full h-full touch-none cursor-crosshair bg-[var(--color-surface-3)]"
              />
              <div className="absolute left-6 right-6 bottom-9 h-px bg-[var(--color-divider-soft)] pointer-events-none" />
              {vacia ? (
                <div className="absolute inset-0 grid place-items-center pointer-events-none text-[13px] tracking-[.12em] uppercase opacity-45">
                  Firma acá
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {girado ? (
          <div className="flex-none px-4 py-2 text-center text-[11px] tracking-[.08em] uppercase opacity-62 border-t border-[var(--color-divider-soft)]">
            Gira el teléfono para verlo derecho — ya puedes firmar así
          </div>
        ) : null}
      </div>
    );
  }

  // ── Hoja normal ───────────────────────────────────────────────────────────
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
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
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
              autoComplete="off"
              className="w-full min-h-[52px] px-3.5 py-3 text-base tabular-nums bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none"
            />
            {rut.trim() && rutCompleto(rut) && !rutDvCorrecto(rut) ? (
              <div className="mt-1 text-xs text-[var(--color-accent-800)]">
                Ese RUT no es válido: revisa el dígito verificador.
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setALoAncho(true)}
          className="w-full min-h-[54px] flex items-center justify-between px-4 mb-3 bg-[var(--color-text)] text-[var(--color-bg)] border-0 font-extrabold text-sm cursor-pointer text-left"
        >
          <span>Firmar a lo ancho (más espacio)</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="7" width="20" height="10" rx="1.5" />
            <path d="M17 3l3 3-3 3" />
          </svg>
        </button>

        <div className="text-[10px] tracking-[.12em] uppercase opacity-66 mb-1.5">O firma dentro del recuadro</div>
        <div className="relative border border-[var(--color-divider)] bg-[var(--color-surface-3)]">
          <div className="h-[220px] [&>canvas]:w-full [&>canvas]:h-[220px]">{lienzo}</div>
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
