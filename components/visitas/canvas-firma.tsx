"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

const COLOR_TRAZO = "#1A1D21";
const GROSOR_TRAZO = 2.5;
const ANCHO_MAXIMO_EXPORT = 600;
const ALTO_CANVAS_CSS = 180;

export type ManejadorCanvasFirma = {
  limpiar: () => void;
  estaVacio: () => boolean;
  /** PNG data URL, redimensionado a un máximo de 600px de ancho. */
  exportarPng: () => string;
};

/**
 * Canvas de firma a dedo. Pointer events y nada más: es lo único que hace
 * falta para andar igual con mouse y con touch, sin duplicar manejadores de
 * mouse y de touch por separado.
 *
 * El trazo se dibuja a la resolución real de la pantalla (con
 * `devicePixelRatio`) para que no se vea dentado en un celular, pero se
 * EXPORTA redimensionado a 600px de ancho como máximo — una firma no
 * necesita más, y sin este paso un teléfono con DPR 3 exportaría una imagen
 * varias veces más pesada de lo necesario para guardar en una columna de
 * texto.
 *
 * `touch-action: none` en el canvas más el bloqueo de scroll del body
 * mientras hay un trazo activo cubren los dos casos de "se me fue el dedo y
 * la página se movió": el gesto de arrastre del navegador y el rebote de
 * iOS Safari.
 */
export const CanvasFirma = forwardRef<ManejadorCanvasFirma, { disabled?: boolean }>(
  function CanvasFirma({ disabled }, ref) {
    const contenedorRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dibujando = useRef(false);
    const vacio = useRef(true);
    const ultimaPos = useRef<{ x: number; y: number } | null>(null);

    function contexto() {
      return canvasRef.current?.getContext("2d") ?? null;
    }

    function limpiar() {
      const canvas = canvasRef.current;
      const ctx = contexto();
      if (!canvas || !ctx) return;
      // El tamaño real ya incluye el devicePixelRatio; limpiar con el ancho
      // "css" alcanza porque el contexto ya está escalado.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      vacio.current = true;
    }

    useEffect(() => {
      const contenedor = contenedorRef.current;
      const canvas = canvasRef.current;
      if (!contenedor || !canvas) return;

      function ajustar() {
        const dpr = window.devicePixelRatio || 1;
        const anchoCss = contenedor!.clientWidth || 300;

        canvas!.width = Math.round(anchoCss * dpr);
        canvas!.height = Math.round(ALTO_CANVAS_CSS * dpr);
        canvas!.style.width = `${anchoCss}px`;
        canvas!.style.height = `${ALTO_CANVAS_CSS}px`;

        const ctx = canvas!.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, anchoCss, ALTO_CANVAS_CSS);
        ctx.lineWidth = GROSOR_TRAZO;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = COLOR_TRAZO;
        vacio.current = true;
      }

      ajustar();

      const observador = new ResizeObserver(() => ajustar());
      observador.observe(contenedor);
      return () => observador.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
      limpiar,
      estaVacio: () => vacio.current,
      exportarPng: () => {
        const canvas = canvasRef.current;
        if (!canvas) return "";

        const escala = Math.min(1, ANCHO_MAXIMO_EXPORT / canvas.width);
        const anchoFinal = Math.max(1, Math.round(canvas.width * escala));
        const altoFinal = Math.max(1, Math.round(canvas.height * escala));

        const temporal = document.createElement("canvas");
        temporal.width = anchoFinal;
        temporal.height = altoFinal;
        const ctxTemporal = temporal.getContext("2d");
        if (!ctxTemporal) return canvas.toDataURL("image/png");

        ctxTemporal.fillStyle = "#ffffff";
        ctxTemporal.fillRect(0, 0, anchoFinal, altoFinal);
        ctxTemporal.drawImage(canvas, 0, 0, anchoFinal, altoFinal);
        return temporal.toDataURL("image/png");
      },
    }));

    function coordenadas(evento: ReactPointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return { x: evento.clientX - rect.left, y: evento.clientY - rect.top };
    }

    function alBajarPuntero(evento: ReactPointerEvent<HTMLCanvasElement>) {
      if (disabled) return;
      const canvas = canvasRef.current;
      const ctx = contexto();
      if (!canvas || !ctx) return;

      canvas.setPointerCapture(evento.pointerId);
      dibujando.current = true;
      ultimaPos.current = coordenadas(evento);

      // Punto (no solo línea): un tap sin arrastre tiene que dejar una marca.
      ctx.beginPath();
      ctx.arc(ultimaPos.current.x, ultimaPos.current.y, GROSOR_TRAZO / 2, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_TRAZO;
      ctx.fill();
      vacio.current = false;

      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    }

    function alMoverPuntero(evento: ReactPointerEvent<HTMLCanvasElement>) {
      if (!dibujando.current) return;
      const ctx = contexto();
      if (!ctx || !ultimaPos.current) return;

      const actual = coordenadas(evento);
      ctx.beginPath();
      ctx.moveTo(ultimaPos.current.x, ultimaPos.current.y);
      ctx.lineTo(actual.x, actual.y);
      ctx.stroke();
      ultimaPos.current = actual;
      vacio.current = false;
    }

    function soltar() {
      dibujando.current = false;
      ultimaPos.current = null;
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }

    return (
      <div ref={contenedorRef} className="w-full">
        <canvas
          ref={canvasRef}
          onPointerDown={alBajarPuntero}
          onPointerMove={alMoverPuntero}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onPointerLeave={soltar}
          className={[
            "block touch-none rounded-base border bg-white",
            disabled ? "cursor-not-allowed border-borde opacity-50" : "border-borde",
          ].join(" ")}
          style={{ height: ALTO_CANVAS_CSS, width: "100%" }}
          aria-label="Área para dibujar la firma"
          role="img"
        />
      </div>
    );
  },
);
